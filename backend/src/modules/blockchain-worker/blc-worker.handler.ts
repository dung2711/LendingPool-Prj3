import type { Logger } from "@logtape/logtape";
import { Contract } from "ethers";
import {
  ProtocolContract,
  protocolContractABIs,
  TransactionType,
} from "src/shared/constants";
import type { DatabaseClient } from "src/shared/infra";
import type {
  IAccrueEventReq,
  ICollateralFactorUpdatedEventReq,
  ILiquidationParamsUpdatedEventReq,
  IMarketSupportedEventReq,
  IMarketUnsupportedEventReq,
  ITransactionEventReq,
} from "src/shared/types";
import type { IdUtils } from "src/shared/utils/id";
import type { BlockchainConfig } from "../blockchain/blockchain.config";

type TransactionTypeValue =
  | TransactionType.Deposit
  | TransactionType.Withdraw
  | TransactionType.Borrow
  | TransactionType.Repay
  | TransactionType.Liquidate;

export function createBLCWorkerHandler(deps: {
  logger: Logger;
  dbClient: DatabaseClient;
  blcConfig: BlockchainConfig;
  idUtils: IdUtils;
}) {
  const { logger, dbClient, blcConfig, idUtils } = deps;

  async function ensureUser(userAddress: string) {
    await dbClient.user.findOrCreate({
      where: { userAddress },
      defaults: {
        id: idUtils.generateId(),
        userAddress,
        joinedAt: new Date(),
        createdAt: new Date(),
      },
    });

    const user = await dbClient.user.findOne({ where: { userAddress } });
    if (!user) {
      throw new Error(`User not found after creation: ${userAddress}`);
    }

    return user;
  }

  async function ensureAsset(
    assetAddress: string,
    chainId: ITransactionEventReq["chainId"],
  ) {
    const existingAsset = await dbClient.asset.findOne({
      where: { assetAddress },
    });
    if (existingAsset) {
      return existingAsset;
    }

    const erc20Contract = blcConfig.getERC20Contract(assetAddress, chainId);
    const [name, symbol, decimals] = await Promise.all([
      erc20Contract.name(),
      erc20Contract.symbol(),
      erc20Contract.decimals(),
    ]);

    await dbClient.asset.create({
      id: idUtils.generateId(),
      assetAddress,
      name,
      symbol,
      decimals: Number(decimals),
      isSupported: true,
      totalDeposited: "0",
      totalBorrowed: "0",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const createdAsset = await dbClient.asset.findOne({
      where: { assetAddress },
    });
    if (!createdAsset) {
      throw new Error(`Asset not found after creation: ${assetAddress}`);
    }

    return createdAsset;
  }

  async function calculateAmountUsd(params: {
    chainId: ITransactionEventReq["chainId"];
    assetAddress: string;
    amount: string;
  }): Promise<string> {
    const { chainId, assetAddress, amount } = params;

    try {
      const priceRouterContract = blcConfig.getProtocolContract(
        ProtocolContract.PriceRouter,
        chainId,
      );
      const erc20Contract = blcConfig.getERC20Contract(assetAddress, chainId);
      const [assetPrice, decimals] = await Promise.all([
        priceRouterContract.getPrice(assetAddress),
        erc20Contract.decimals(),
      ]);

      return (
        (BigInt(amount) * assetPrice) /
        10n ** BigInt(decimals)
      ).toString();
    } catch (error) {
      logger.warn("Could not fetch price for asset {assetAddress}: {error}", {
        assetAddress,
        error: (error as Error).message,
      });

      return "0";
    }
  }

  async function ensureTransaction(params: {
    transactionHash: string;
    chainId: ITransactionEventReq["chainId"];
    userId: string;
    assetId: string;
    amount: string;
    amountUSD: string;
    blockNumber: number;
    type: TransactionTypeValue;
  }) {
    const {
      transactionHash,
      chainId,
      userId,
      assetId,
      amount,
      amountUSD,
      blockNumber,
      type,
    } = params;

    const [transaction, created] = await dbClient.transaction.findOrCreate({
      where: { transactionHash },
      defaults: {
        transactionHash,
        chainId: chainId.toString(),
        userId,
        assetId,
        amount,
        amountUSD,
        blockNumber: BigInt(blockNumber),
        type,
        createdAt: new Date(),
      },
    });

    if (!created && transaction.type !== type) {
      logger.warn(
        "Transaction hash already exists with a different type, keeping existing record",
        {
          transactionHash,
          existingType: transaction.type,
          incomingType: type,
        },
      );
    }

    return transaction;
  }

  async function syncUserAssetBalance(params: {
    userId: string;
    userAddress: string;
    assetId: string;
    assetAddress: string;
    chainId: ITransactionEventReq["chainId"];
  }) {
    const { userId, userAddress, assetId, assetAddress, chainId } = params;

    const lendingPoolContract = blcConfig.getProtocolContract(
      ProtocolContract.LendingPool,
      chainId,
    );
    const userBalance = await lendingPoolContract.userBalances(
      userAddress,
      assetAddress,
    );
    const depositedAmount = userBalance.deposited.toString();
    const borrowedAmount = userBalance.borrowed.toString();

    const [, created] = await dbClient.userAsset.findOrCreate({
      where: {
        userId,
        assetId,
      },
      defaults: {
        userId,
        assetId,
        depositedAmount,
        borrowedAmount,
      },
    });

    if (!created) {
      await dbClient.userAsset.update(
        {
          depositedAmount,
          borrowedAmount,
        },
        {
          where: {
            userId,
            assetId,
          },
        },
      );
    }
  }

  async function updateAssetTotalsByDelta(params: {
    assetAddress: string;
    depositedDelta?: bigint;
    borrowedDelta?: bigint;
  }) {
    const { assetAddress, depositedDelta = 0n, borrowedDelta = 0n } = params;

    const asset = await dbClient.asset.findOne({ where: { assetAddress } });
    if (!asset) {
      throw new Error(`Asset not found: ${assetAddress}`);
    }

    const nextDeposited = BigInt(asset.totalDeposited) + depositedDelta;
    const nextBorrowed = BigInt(asset.totalBorrowed) + borrowedDelta;

    await dbClient.asset.update(
      {
        totalDeposited: (nextDeposited < 0n ? 0n : nextDeposited).toString(),
        totalBorrowed: (nextBorrowed < 0n ? 0n : nextBorrowed).toString(),
      },
      {
        where: {
          assetAddress,
        },
      },
    );
  }

  async function fetchMarketConfigValues(params: {
    chainId: IMarketSupportedEventReq["chainId"];
    interestRateModelAddress: string;
  }) {
    const { chainId, interestRateModelAddress } = params;

    const provider = blcConfig.getProvider(chainId);
    const interestRateModelContract = new Contract(
      interestRateModelAddress,
      protocolContractABIs[ProtocolContract.InterestRateModel],
      provider,
    );

    const lendingPoolContract = blcConfig.getProtocolContract(
      ProtocolContract.LendingPool,
      chainId,
    );

    const liquidationContract = blcConfig.getProtocolContract(
      ProtocolContract.Liquidation,
      chainId,
    );

    const [
      baseRate,
      slope1,
      slope2,
      optimalUtilization,
      reserveFactor,
      collateralFactor,
      closeFactor,
      liquidationIncentive,
      liquidationThreshold,
    ] = await Promise.all([
      interestRateModelContract.baseRate(),
      interestRateModelContract.rateSlope1(),
      interestRateModelContract.rateSlope2(),
      interestRateModelContract.optimalUtilization(),
      interestRateModelContract.reserveFactor(),
      lendingPoolContract.collateralFactor(),
      liquidationContract.closeFactor(),
      liquidationContract.liquidationIncentive(),
      liquidationContract.liquidationThreshold(),
    ]);

    return {
      baseRate: baseRate.toString(),
      slope1: slope1.toString(),
      slope2: slope2.toString(),
      optimalUtilization: optimalUtilization.toString(),
      reserveFactor: reserveFactor.toString(),
      collateralFactor: collateralFactor.toString(),
      closeFactor: closeFactor.toString(),
      liquidationIncentive: liquidationIncentive.toString(),
      liquidationThreshold: liquidationThreshold.toString(),
    };
  }

  async function handleDepositJob(params: ITransactionEventReq) {
    try {
      const {
        chainId,
        userAddress,
        assetAddress,
        amount,
        transactionHash,
        blockNumber,
      } = params;

      logger.info(
        "Deposit event received from queue on {chainId}: user {userAddress} deposited {amount} of asset {assetAddress} in transaction {transactionHash} at block {blockNumber}",
        {
          chainId,
          userAddress,
          assetAddress,
          amount,
          transactionHash,
          blockNumber,
        },
      );

      const [user, asset, amountUSD] = await Promise.all([
        ensureUser(userAddress),
        ensureAsset(assetAddress, chainId),
        calculateAmountUsd({ chainId, assetAddress, amount }),
      ]);

      await ensureTransaction({
        transactionHash,
        chainId,
        userId: user.id,
        assetId: asset.id,
        amount,
        amountUSD,
        blockNumber,
        type: TransactionType.Deposit,
      });

      await syncUserAssetBalance({
        userId: user.id,
        userAddress,
        assetId: asset.id,
        assetAddress,
        chainId,
      });

      await updateAssetTotalsByDelta({
        assetAddress,
        depositedDelta: BigInt(amount),
      });

      logger.info("Deposit processed: TX {transactionHash}", {
        transactionHash,
      });
    } catch (error) {
      logger.error("Error handling Deposit event", {
        error: (error as Error).message,
        payload: params,
      });
      throw error;
    }
  }

  async function handleWithdrawJob(params: ITransactionEventReq) {
    try {
      const {
        chainId,
        userAddress,
        assetAddress,
        amount,
        transactionHash,
        blockNumber,
      } = params;

      logger.info(
        "Withdraw event received from queue on {chainId}: user {userAddress} withdrew {amount} of asset {assetAddress} in transaction {transactionHash} at block {blockNumber}",
        {
          chainId,
          userAddress,
          assetAddress,
          amount,
          transactionHash,
          blockNumber,
        },
      );

      const [user, asset, amountUSD] = await Promise.all([
        ensureUser(userAddress),
        ensureAsset(assetAddress, chainId),
        calculateAmountUsd({ chainId, assetAddress, amount }),
      ]);

      await ensureTransaction({
        transactionHash,
        chainId,
        userId: user.id,
        assetId: asset.id,
        amount,
        amountUSD,
        blockNumber,
        type: TransactionType.Withdraw,
      });

      await syncUserAssetBalance({
        userId: user.id,
        userAddress,
        assetId: asset.id,
        assetAddress,
        chainId,
      });

      await updateAssetTotalsByDelta({
        assetAddress,
        depositedDelta: -BigInt(amount),
      });

      logger.info("Withdraw processed: TX {transactionHash}", {
        transactionHash,
      });
    } catch (error) {
      logger.error("Error handling Withdraw event", {
        error: (error as Error).message,
        payload: params,
      });
      throw error;
    }
  }

  async function handleBorrowJob(params: ITransactionEventReq) {
    try {
      const {
        chainId,
        userAddress,
        assetAddress,
        amount,
        transactionHash,
        blockNumber,
      } = params;

      logger.info(
        "Borrow event received from queue on {chainId}: user {userAddress} borrowed {amount} of asset {assetAddress} in transaction {transactionHash} at block {blockNumber}",
        {
          chainId,
          userAddress,
          assetAddress,
          amount,
          transactionHash,
          blockNumber,
        },
      );

      const [user, asset, amountUSD] = await Promise.all([
        ensureUser(userAddress),
        ensureAsset(assetAddress, chainId),
        calculateAmountUsd({ chainId, assetAddress, amount }),
      ]);

      await ensureTransaction({
        transactionHash,
        chainId,
        userId: user.id,
        assetId: asset.id,
        amount,
        amountUSD,
        blockNumber,
        type: TransactionType.Borrow,
      });

      await syncUserAssetBalance({
        userId: user.id,
        userAddress,
        assetId: asset.id,
        assetAddress,
        chainId,
      });

      await updateAssetTotalsByDelta({
        assetAddress,
        borrowedDelta: BigInt(amount),
      });

      logger.info("Borrow processed: TX {transactionHash}", {
        transactionHash,
      });
    } catch (error) {
      logger.error("Error handling Borrow event", {
        error: (error as Error).message,
        payload: params,
      });
      throw error;
    }
  }

  async function handleRepayJob(params: ITransactionEventReq) {
    try {
      const {
        chainId,
        userAddress,
        assetAddress,
        amount,
        transactionHash,
        blockNumber,
      } = params;

      logger.info(
        "Repay event received from queue on {chainId}: user {userAddress} repaid {amount} of asset {assetAddress} in transaction {transactionHash} at block {blockNumber}",
        {
          chainId,
          userAddress,
          assetAddress,
          amount,
          transactionHash,
          blockNumber,
        },
      );

      const [user, asset, amountUSD] = await Promise.all([
        ensureUser(userAddress),
        ensureAsset(assetAddress, chainId),
        calculateAmountUsd({ chainId, assetAddress, amount }),
      ]);

      await ensureTransaction({
        transactionHash,
        chainId,
        userId: user.id,
        assetId: asset.id,
        amount,
        amountUSD,
        blockNumber,
        type: TransactionType.Repay,
      });

      await syncUserAssetBalance({
        userId: user.id,
        userAddress,
        assetId: asset.id,
        assetAddress,
        chainId,
      });

      await updateAssetTotalsByDelta({
        assetAddress,
        borrowedDelta: -BigInt(amount),
      });

      logger.info("Repay processed: TX {transactionHash}", { transactionHash });
    } catch (error) {
      logger.error("Error handling Repay event", {
        error: (error as Error).message,
        payload: params,
      });
      throw error;
    }
  }

  async function handleCollateralSeizedJob(params: ITransactionEventReq) {
    try {
      const {
        chainId,
        userAddress,
        assetAddress,
        amount,
        transactionHash,
        blockNumber,
      } = params;

      logger.info(
        "CollateralSeized event received on {chainId}: borrower {userAddress}, asset {assetAddress}, amount {amount}, tx {transactionHash}, block {blockNumber}",
        {
          chainId,
          userAddress,
          assetAddress,
          amount,
          transactionHash,
          blockNumber,
        },
      );

      const [user, asset, amountUSD] = await Promise.all([
        ensureUser(userAddress),
        ensureAsset(assetAddress, chainId),
        calculateAmountUsd({ chainId, assetAddress, amount }),
      ]);

      await ensureTransaction({
        transactionHash,
        chainId,
        userId: user.id,
        assetId: asset.id,
        amount,
        amountUSD,
        blockNumber,
        type: TransactionType.Liquidate,
      });

      await syncUserAssetBalance({
        userId: user.id,
        userAddress,
        assetId: asset.id,
        assetAddress,
        chainId,
      });

      logger.info("CollateralSeized processed: TX {transactionHash}", {
        transactionHash,
      });
    } catch (error) {
      logger.error("Error handling CollateralSeized event", {
        error: (error as Error).message,
        payload: params,
      });
      throw error;
    }
  }

  async function handleAccrueJob(params: IAccrueEventReq) {
    try {
      const {
        chainId,
        assetAddress,
        newTotalBorrows,
        newTotalDeposits,
        transactionHash,
        blockNumber,
      } = params;

      logger.info(
        "Accrue event received on {chainId}: asset {assetAddress}, deposits {newTotalDeposits}, borrows {newTotalBorrows}, tx {transactionHash}, block {blockNumber}",
        {
          chainId,
          assetAddress,
          newTotalDeposits,
          newTotalBorrows,
          transactionHash,
          blockNumber,
        },
      );

      await ensureAsset(assetAddress, chainId);

      await dbClient.asset.update(
        {
          totalDeposited: newTotalDeposits,
          totalBorrowed: newTotalBorrows,
        },
        {
          where: { assetAddress },
        },
      );

      logger.info("Accrue processed: TX {transactionHash}", {
        transactionHash,
      });
    } catch (error) {
      logger.error("Error handling Accrue event", {
        error: (error as Error).message,
        payload: params,
      });
      throw error;
    }
  }

  async function handleMarketSupportedJob(params: IMarketSupportedEventReq) {
    try {
      const {
        chainId,
        assetAddress,
        interestRateModelAddress,
        transactionHash,
        blockNumber,
      } = params;

      logger.info(
        "MarketSupported event received on {chainId}: asset {assetAddress}, interestRateModel {interestRateModelAddress}, tx {transactionHash}, block {blockNumber}",
        {
          chainId,
          assetAddress,
          interestRateModelAddress,
          transactionHash,
          blockNumber,
        },
      );

      const asset = await ensureAsset(assetAddress, chainId);

      if (!asset.isSupported) {
        await dbClient.asset.update(
          { isSupported: true },
          { where: { assetAddress } },
        );
      }

      const marketConfigValues = await fetchMarketConfigValues({
        chainId,
        interestRateModelAddress,
      });

      const existingConfig = await dbClient.assetConfig.findOne({
        where: { assetId: asset.id },
      });

      if (existingConfig) {
        await dbClient.assetConfig.update(marketConfigValues, {
          where: { assetId: asset.id },
        });
      } else {
        await dbClient.assetConfig.create({
          id: idUtils.generateId(),
          assetId: asset.id,
          ...marketConfigValues,
        });
      }

      logger.info("MarketSupported processed: TX {transactionHash}", {
        transactionHash,
      });
    } catch (error) {
      logger.error("Error handling MarketSupported event", {
        error: (error as Error).message,
        payload: params,
      });
      throw error;
    }
  }

  async function handleMarketUnsupportedJob(
    params: IMarketUnsupportedEventReq,
  ) {
    try {
      const { chainId, assetAddress, transactionHash, blockNumber } = params;

      logger.info(
        "MarketUnsupported event received on {chainId}: asset {assetAddress}, tx {transactionHash}, block {blockNumber}",
        { chainId, assetAddress, transactionHash, blockNumber },
      );

      await dbClient.asset.update(
        { isSupported: false },
        { where: { assetAddress } },
      );

      logger.info("MarketUnsupported processed: TX {transactionHash}", {
        transactionHash,
      });
    } catch (error) {
      logger.error("Error handling MarketUnsupported event", {
        error: (error as Error).message,
        payload: params,
      });
      throw error;
    }
  }

  async function handleCollateralFactorUpdatedJob(
    params: ICollateralFactorUpdatedEventReq,
  ) {
    try {
      const { chainId, collateralFactor, transactionHash, blockNumber } =
        params;

      logger.info(
        "CollateralFactorUpdated event received on {chainId}: collateralFactor {collateralFactor}, tx {transactionHash}, block {blockNumber}",
        { chainId, collateralFactor, transactionHash, blockNumber },
      );

      await dbClient.assetConfig.update({ collateralFactor }, { where: {} });

      logger.info("CollateralFactorUpdated processed: TX {transactionHash}", {
        transactionHash,
      });
    } catch (error) {
      logger.error("Error handling CollateralFactorUpdated event", {
        error: (error as Error).message,
        payload: params,
      });
      throw error;
    }
  }

  async function handleLiquidationParamsUpdatedJob(
    params: ILiquidationParamsUpdatedEventReq,
  ) {
    try {
      const {
        chainId,
        closeFactor,
        liquidationIncentive,
        liquidationThreshold,
        transactionHash,
        blockNumber,
      } = params;

      logger.info(
        "LiquidationParamsUpdated event received on {chainId}: closeFactor {closeFactor}, liquidationIncentive {liquidationIncentive}, liquidationThreshold {liquidationThreshold}, tx {transactionHash}, block {blockNumber}",
        {
          chainId,
          closeFactor,
          liquidationIncentive,
          liquidationThreshold,
          transactionHash,
          blockNumber,
        },
      );

      await dbClient.assetConfig.update(
        {
          closeFactor,
          liquidationIncentive,
          liquidationThreshold,
        },
        { where: {} },
      );

      logger.info("LiquidationParamsUpdated processed: TX {transactionHash}", {
        transactionHash,
      });
    } catch (error) {
      logger.error("Error handling LiquidationParamsUpdated event", {
        error: (error as Error).message,
        payload: params,
      });
      throw error;
    }
  }

  return {
    handleDepositJob,
    handleWithdrawJob,
    handleBorrowJob,
    handleRepayJob,
    handleCollateralSeizedJob,
    handleAccrueJob,
    handleMarketSupportedJob,
    handleMarketUnsupportedJob,
    handleCollateralFactorUpdatedJob,
    handleLiquidationParamsUpdatedJob,
  };
}

export type BLCWorkerHandler = ReturnType<typeof createBLCWorkerHandler>;
