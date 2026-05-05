import type { Logger } from "@logtape/logtape";
import { Contract } from "ethers";
import type Redis from "ioredis";
import {
  literal,
  Op,
  QueryTypes,
  type Sequelize,
  type Transaction as SequelizeTransaction,
} from "sequelize";
import {
  DuplicateTransactionError,
  ProtocolContract,
  protocolContractABIs,
  TransactionType,
  TreasuryEventType,
} from "src/shared/constants";
import type { DatabaseClient } from "src/shared/infra";
import type {
  ChainId,
  IAccrueEventReq,
  ICollateralFactorUpdatedEventReq,
  IDonatedEventReq,
  ILiquidationParamsUpdatedEventReq,
  IMarketSupportedEventReq,
  IMarketUnsupportedEventReq,
  ITransactionEventReq,
  ITreasuryWithdrawnEventReq,
  ReorgLockPayload,
  SyncCursor,
} from "src/shared/types";
import {
  getReorgLockRedisKey,
  getUserAssetSyncRedisKey,
} from "src/shared/utils";
import type { IdUtils } from "src/shared/utils/id";
import type { BlockchainConfig } from "../blockchain/blockchain.config";

export function createBLCWorkerHandler(deps: {
  logger: Logger;
  dbClient: DatabaseClient;
  blcConfig: BlockchainConfig;
  idUtils: IdUtils;
  sequelize: Sequelize;
  redisClient: Redis;
}) {
  const { logger, dbClient, blcConfig, idUtils, sequelize, redisClient } = deps;

  function isIncomingCursorStale(params: {
    current: SyncCursor;
    incoming: SyncCursor;
  }) {
    const { current, incoming } = params;

    return (
      incoming.blockNumber < current.blockNumber ||
      (incoming.blockNumber === current.blockNumber &&
        incoming.logIndex <= current.logIndex)
    );
  }

  function assertValidLogIndex(params: {
    logIndex: number;
    transactionHash: string;
    blockNumber: number;
  }) {
    const { logIndex, transactionHash, blockNumber } = params;
    if (!Number.isInteger(logIndex) || logIndex < 0) {
      throw new Error(
        `Invalid logIndex for tx ${transactionHash} at block ${blockNumber}`,
      );
    }
  }

  async function readReorgLock(
    chainId: ChainId,
  ): Promise<ReorgLockPayload | null> {
    const redisKey = getReorgLockRedisKey(chainId);
    try {
      const cached = await redisClient.get(redisKey);
      if (!cached) return null;
      const parsed = JSON.parse(cached) as ReorgLockPayload;
      if (!Number.isFinite(parsed.forkPoint)) return null;
      return {
        forkPoint: Number(parsed.forkPoint),
        startedAt: Number(parsed.startedAt),
      };
    } catch (error) {
      logger.warn("Failed to read reorg lock from Redis", {
        redisKey,
        error: (error as Error).message,
      });
      return null;
    }
  }

  async function shouldSkipDueToReorg(params: {
    chainId: ChainId;
    blockNumber: number;
    eventName: string;
  }): Promise<boolean> {
    const { chainId, blockNumber, eventName } = params;
    const lock = await readReorgLock(chainId);
    if (!lock) return false;

    if (blockNumber > lock.forkPoint) {
      logger.warn("Skipping event during reorg", {
        chainId,
        eventName,
        blockNumber,
        forkPoint: lock.forkPoint,
      });
      return true;
    }

    return false;
  }

  async function readLastSyncedCursor(params: {
    redisKey: string;
    userId: bigint;
    assetId: bigint;
    transaction: SequelizeTransaction;
  }): Promise<SyncCursor> {
    const { redisKey, userId, assetId, transaction } = params;

    try {
      const cached = await redisClient.get(redisKey);
      if (cached) {
        const parsed = JSON.parse(cached) as SyncCursor;
        if (
          Number.isFinite(parsed.blockNumber) &&
          Number.isFinite(parsed.logIndex)
        ) {
          return parsed;
        }
      }
    } catch (error) {
      logger.warn("Failed to read sync cursor from Redis", {
        redisKey,
        error: (error as Error).message,
      });
    }

    const row = await dbClient.userAsset.findOne({
      where: {
        userId,
        assetId,
      },
      attributes: ["lastSyncedBlock", "lastSyncedLogIndex"],
      transaction,
    });

    if (!row) {
      return {
        blockNumber: 0,
        logIndex: 0,
      };
    }

    return {
      blockNumber: Number(row.lastSyncedBlock),
      logIndex: Number(row.lastSyncedLogIndex),
    };
  }

  async function writeLastSyncedCursor(params: {
    redisKey: string;
    cursor: SyncCursor;
  }) {
    const { redisKey, cursor } = params;

    try {
      await redisClient.set(redisKey, JSON.stringify(cursor));
    } catch (error) {
      logger.warn("Failed to write sync cursor to Redis", {
        redisKey,
        error: (error as Error).message,
      });
    }
  }

  async function ensureUser(
    userAddress: string,
    chainId: ITransactionEventReq["chainId"],
  ) {
    const [user] = await dbClient.user.findOrCreate({
      where: { userAddress, chainId },
      defaults: {
        id: idUtils.snowflakeId(),
        userAddress,
        chainId,
        joinedAt: new Date(),
        createdAt: new Date(),
      },
    });

    return user;
  }

  async function ensureAsset(
    assetAddress: string,
    chainId: ITransactionEventReq["chainId"],
  ) {
    const existingAsset = await dbClient.asset.findOne({
      where: { assetAddress, chainId },
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

    await dbClient.$sequelize.query(
      `INSERT INTO "assets" ("id", "assetAddress", "chainId", "name", "symbol", "decimals", "isSupported", "totalDeposited", "totalBorrowed", "createdAt", "updatedAt")
   VALUES (:id, :assetAddress, :chainId, :name, :symbol, :decimals, :isSupported, :totalDeposited, :totalBorrowed, :createdAt, :updatedAt)
   ON CONFLICT ("assetAddress", "chainId") DO NOTHING`,
      {
        replacements: {
          id: idUtils.snowflakeId(),
          assetAddress,
          chainId,
          name,
          symbol,
          decimals: Number(decimals),
          isSupported: true,
          totalDeposited: "0",
          totalBorrowed: "0",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        type: QueryTypes.INSERT,
      },
    );

    return await dbClient.asset.findOne({ where: { assetAddress, chainId } });
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
    userId: bigint;
    assetId: bigint;
    amount: string;
    amountUSD: string;
    blockNumber: number;
    type: TransactionType;
    transaction: SequelizeTransaction;
  }) {
    const {
      transactionHash,
      userId,
      assetId,
      amount,
      amountUSD,
      blockNumber,
      type,
      transaction,
    } = params;

    const [tx, created] = await dbClient.transaction.findOrCreate({
      where: { transactionHash, type },
      defaults: {
        transactionHash,
        userId,
        assetId,
        amount,
        amountUSD,
        blockNumber: BigInt(blockNumber),
        type,
        createdAt: new Date(),
      },
      transaction,
    });

    if (!created) {
      throw new DuplicateTransactionError(transactionHash);
    }

    return tx;
  }

  async function syncUserAssetBalance(params: {
    userId: bigint;
    userAddress: string;
    assetId: bigint;
    assetAddress: string;
    chainId: ITransactionEventReq["chainId"];
    blockNumber: number;
    logIndex: number;
    transaction: SequelizeTransaction;
  }) {
    const {
      userId,
      userAddress,
      assetId,
      assetAddress,
      chainId,
      blockNumber,
      logIndex,
      transaction,
    } = params;

    const redisKey = getUserAssetSyncRedisKey({ userId, assetId });
    const incomingCursor: SyncCursor = { blockNumber, logIndex };
    const incomingBlock = BigInt(blockNumber);
    const incomingLogIndex = logIndex;

    const currentCursor = await readLastSyncedCursor({
      redisKey,
      userId,
      assetId,
      transaction,
    });

    if (
      isIncomingCursorStale({
        current: currentCursor,
        incoming: incomingCursor,
      })
    ) {
      logger.debug("Skipping stale user-asset sync", {
        userId,
        assetId,
        blockNumber,
        logIndex,
        currentBlock: currentCursor.blockNumber,
        currentLogIndex: currentCursor.logIndex,
      });
      return;
    }

    const lendingPoolContract = blcConfig.getProtocolContract(
      ProtocolContract.LendingPool,
      chainId,
    );
    const userBalance = await lendingPoolContract.userBalances(
      userAddress,
      assetAddress,
      { blockTag: blockNumber },
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
        lastSyncedBlock: incomingBlock,
        lastSyncedLogIndex: incomingLogIndex,
      },
      transaction,
    });

    let didPersist = created;

    if (!created) {
      const [updatedRows] = await dbClient.userAsset.update(
        {
          depositedAmount,
          borrowedAmount,
          lastSyncedBlock: incomingBlock,
          lastSyncedLogIndex: incomingLogIndex,
        },
        {
          where: {
            userId,
            assetId,
            [Op.or]: [
              {
                lastSyncedBlock: {
                  [Op.lt]: incomingBlock,
                },
              },
              {
                lastSyncedBlock: incomingBlock,
                lastSyncedLogIndex: {
                  [Op.lt]: incomingLogIndex,
                },
              },
            ],
          },
          transaction,
        },
      );

      if (updatedRows === 0) {
        logger.debug("Skip user-asset update due to newer cursor", {
          userId,
          assetId,
          blockNumber,
          logIndex,
        });
        return;
      }

      didPersist = true;
    }

    if (didPersist) {
      transaction.afterCommit(() =>
        writeLastSyncedCursor({
          redisKey,
          cursor: incomingCursor,
        }),
      );
    }
  }

  async function updateAssetTotalsByDelta(params: {
    chainId: ITransactionEventReq["chainId"];
    assetAddress: string;
    depositedDelta?: bigint;
    borrowedDelta?: bigint;
    transaction: SequelizeTransaction;
  }) {
    const {
      chainId,
      assetAddress,
      depositedDelta = 0n,
      borrowedDelta = 0n,
      transaction,
    } = params;

    const [affectedRows] = await dbClient.asset.update(
      {
        totalDeposited: literal(
          `GREATEST(("totalDeposited"::NUMERIC) + (${depositedDelta.toString()})::NUMERIC, 0)`,
        ),
        totalBorrowed: literal(
          `GREATEST(("totalBorrowed"::NUMERIC) + (${borrowedDelta.toString()})::NUMERIC, 0)`,
        ),
      },
      {
        where: {
          assetAddress,
          chainId,
        },
        transaction,
      },
    );

    if (affectedRows === 0) {
      throw new Error(`Asset not found: ${assetAddress}`);
    }
  }

  async function updateAssetTreasuryBalanceByDelta(params: {
    chainId: ITransactionEventReq["chainId"];
    assetAddress: string;
    treasuryDelta: bigint;
    transaction: SequelizeTransaction;
  }) {
    const { chainId, assetAddress, treasuryDelta, transaction } = params;

    const [affectedRows, updatedAssets] = await dbClient.asset.update(
      {
        treasuryBalance: literal(
          `GREATEST(("treasuryBalance"::NUMERIC) + (${treasuryDelta.toString()})::NUMERIC, 0)`,
        ),
      },
      {
        where: {
          assetAddress,
          chainId,
        },
        transaction,
        returning: true,
      },
    );

    if (affectedRows === 0) {
      throw new Error(`Asset not found: ${assetAddress}`);
    }

    const updatedAsset = updatedAssets[0];
    if (!updatedAsset) {
      throw new Error(`Asset update failed to return row: ${assetAddress}`);
    }

    return updatedAsset.treasuryBalance;
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
        logIndex,
      } = params;

      if (
        await shouldSkipDueToReorg({
          chainId,
          blockNumber,
          eventName: "Deposit",
        })
      ) {
        return;
      }

      assertValidLogIndex({ logIndex, transactionHash, blockNumber });

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
        ensureUser(userAddress, chainId),
        ensureAsset(assetAddress, chainId),
        calculateAmountUsd({ chainId, assetAddress, amount }),
      ]);

      await sequelize.transaction(async (t) => {
        await ensureTransaction({
          transactionHash,
          userId: user.id,
          assetId: asset.id,
          amount,
          amountUSD,
          blockNumber,
          type: TransactionType.Deposit,
          transaction: t,
        });

        await syncUserAssetBalance({
          userId: user.id,
          userAddress,
          assetId: asset.id,
          assetAddress,
          chainId,
          blockNumber,
          logIndex,
          transaction: t,
        });

        await updateAssetTotalsByDelta({
          chainId,
          assetAddress,
          depositedDelta: BigInt(amount),
          transaction: t,
        });
      });

      logger.info("Deposit processed: TX {transactionHash}", {
        transactionHash,
      });
    } catch (error) {
      if (error instanceof DuplicateTransactionError) {
        logger.warn("Skip duplicate Deposit event", {
          transactionHash: params.transactionHash,
        });
        return;
      }
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
        logIndex,
      } = params;

      if (
        await shouldSkipDueToReorg({
          chainId,
          blockNumber,
          eventName: "Withdraw",
        })
      ) {
        return;
      }

      assertValidLogIndex({ logIndex, transactionHash, blockNumber });

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
        ensureUser(userAddress, chainId),
        ensureAsset(assetAddress, chainId),
        calculateAmountUsd({ chainId, assetAddress, amount }),
      ]);

      await sequelize.transaction(async (t) => {
        await ensureTransaction({
          transactionHash,
          userId: user.id,
          assetId: asset.id,
          amount,
          amountUSD,
          blockNumber,
          type: TransactionType.Withdraw,
          transaction: t,
        });

        await syncUserAssetBalance({
          userId: user.id,
          userAddress,
          assetId: asset.id,
          assetAddress,
          chainId,
          blockNumber,
          logIndex,
          transaction: t,
        });

        await updateAssetTotalsByDelta({
          chainId,
          assetAddress,
          depositedDelta: -BigInt(amount),
          transaction: t,
        });
      });

      logger.info("Withdraw processed: TX {transactionHash}", {
        transactionHash,
      });
    } catch (error) {
      if (error instanceof DuplicateTransactionError) {
        logger.warn("Skip duplicate Withdraw event", {
          transactionHash: params.transactionHash,
        });
        return;
      }
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
        logIndex,
      } = params;

      if (
        await shouldSkipDueToReorg({
          chainId,
          blockNumber,
          eventName: "Borrow",
        })
      ) {
        return;
      }

      assertValidLogIndex({ logIndex, transactionHash, blockNumber });

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
        ensureUser(userAddress, chainId),
        ensureAsset(assetAddress, chainId),
        calculateAmountUsd({ chainId, assetAddress, amount }),
      ]);

      await sequelize.transaction(async (t) => {
        await ensureTransaction({
          transactionHash,
          userId: user.id,
          assetId: asset.id,
          amount,
          amountUSD,
          blockNumber,
          type: TransactionType.Borrow,
          transaction: t,
        });

        await syncUserAssetBalance({
          userId: user.id,
          userAddress,
          assetId: asset.id,
          assetAddress,
          chainId,
          blockNumber,
          logIndex,
          transaction: t,
        });

        await updateAssetTotalsByDelta({
          chainId,
          assetAddress,
          borrowedDelta: BigInt(amount),
          transaction: t,
        });
      });

      logger.info("Borrow processed: TX {transactionHash}", {
        transactionHash,
      });
    } catch (error) {
      if (error instanceof DuplicateTransactionError) {
        logger.warn("Skip duplicate Borrow event", {
          transactionHash: params.transactionHash,
        });
        return;
      }
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
        logIndex,
      } = params;

      if (
        await shouldSkipDueToReorg({
          chainId,
          blockNumber,
          eventName: "Repay",
        })
      ) {
        return;
      }

      assertValidLogIndex({ logIndex, transactionHash, blockNumber });

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
        ensureUser(userAddress, chainId),
        ensureAsset(assetAddress, chainId),
        calculateAmountUsd({ chainId, assetAddress, amount }),
      ]);

      await sequelize.transaction(async (t) => {
        await ensureTransaction({
          transactionHash,
          userId: user.id,
          assetId: asset.id,
          amount,
          amountUSD,
          blockNumber,
          type: TransactionType.Repay,
          transaction: t,
        });

        await syncUserAssetBalance({
          userId: user.id,
          userAddress,
          assetId: asset.id,
          assetAddress,
          chainId,
          blockNumber,
          logIndex,
          transaction: t,
        });

        await updateAssetTotalsByDelta({
          chainId,
          assetAddress,
          borrowedDelta: -BigInt(amount),
          transaction: t,
        });
      });

      logger.info("Repay processed: TX {transactionHash}", { transactionHash });
    } catch (error) {
      if (error instanceof DuplicateTransactionError) {
        logger.warn("Skip duplicate Repay event", {
          transactionHash: params.transactionHash,
        });
        return;
      }
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
        logIndex,
      } = params;

      if (
        await shouldSkipDueToReorg({
          chainId,
          blockNumber,
          eventName: "CollateralSeized",
        })
      ) {
        return;
      }

      assertValidLogIndex({ logIndex, transactionHash, blockNumber });

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
        ensureUser(userAddress, chainId),
        ensureAsset(assetAddress, chainId),
        calculateAmountUsd({ chainId, assetAddress, amount }),
      ]);

      await sequelize.transaction(async (t) => {
        await ensureTransaction({
          transactionHash,
          userId: user.id,
          assetId: asset.id,
          amount,
          amountUSD,
          blockNumber,
          type: TransactionType.Liquidate,
          transaction: t,
        });

        await syncUserAssetBalance({
          userId: user.id,
          userAddress,
          assetId: asset.id,
          assetAddress,
          chainId,
          blockNumber,
          logIndex,
          transaction: t,
        });

        await updateAssetTotalsByDelta({
          chainId,
          assetAddress,
          depositedDelta: -BigInt(amount),
          transaction: t,
        });
      });

      logger.info("CollateralSeized processed: TX {transactionHash}", {
        transactionHash,
      });
    } catch (error) {
      if (error instanceof DuplicateTransactionError) {
        logger.warn("Skip duplicate CollateralSeized event", {
          transactionHash: params.transactionHash,
        });
        return;
      }
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
        interestAccrued,
        toDepositors,
        toTreasury,
        totalTreasury,
        newTotalBorrows,
        newBorrowIndex,
        newTotalDeposits,
        newDepositIndex,
        transactionHash,
        blockNumber,
      } = params;

      if (
        await shouldSkipDueToReorg({
          chainId,
          blockNumber,
          eventName: "Accrue",
        })
      ) {
        return;
      }

      logger.info(
        "Accrue event received on {chainId}: asset {assetAddress}, tx {transactionHash}, block {blockNumber}",
        {
          chainId,
          assetAddress,
          interestAccrued,
          toDepositors,
          toTreasury,
          totalTreasury,
          newTotalDeposits,
          newTotalBorrows,
          newBorrowIndex,
          newDepositIndex,
          transactionHash,
          blockNumber,
        },
      );

      const asset = await ensureAsset(assetAddress, chainId);
      if (!asset) {
        throw new Error(`Asset not found: ${assetAddress}`);
      }
      const assetId = asset.id;

      await sequelize.transaction(async (t) => {
        const existingAccrueLog = await dbClient.accrueLog.findOne({
          where: { transactionHash, blockNumber, assetId },
          transaction: t,
        });

        if (existingAccrueLog) {
          logger.warn("Skip duplicate Accrue event", {
            transactionHash,
            blockNumber,
            assetId,
          });
          return;
        }

        await updateAssetTotalsByDelta({
          chainId,
          assetAddress,
          depositedDelta: BigInt(toDepositors),
          borrowedDelta: BigInt(interestAccrued),
          transaction: t,
        });

        const balanceAfter = await updateAssetTreasuryBalanceByDelta({
          chainId,
          assetAddress,
          treasuryDelta: BigInt(toTreasury),
          transaction: t,
        });

        if (BigInt(balanceAfter) !== BigInt(totalTreasury)) {
          logger.warn("Treasury balance drift detected after Accrue", {
            assetAddress,
            transactionHash,
            blockNumber,
            expectedTotalTreasury: totalTreasury,
            calculatedBalanceAfter: balanceAfter,
          });
        }

        await Promise.all([
          dbClient.accrueLog.create(
            {
              id: idUtils.generateId(),
              assetId,
              interestAccrued,
              toDepositors,
              toTreasury,
              newTotalBorrows,
              newBorrowIndex,
              newTotalDeposits,
              newDepositIndex,
              transactionHash,
              blockNumber: BigInt(blockNumber),
              createdAt: new Date(),
            },
            { transaction: t },
          ),
          dbClient.treasuryLog.create(
            {
              id: idUtils.generateId(),
              assetId,
              amount: toTreasury,
              balanceAfter,
              eventType: TreasuryEventType.Accrue,
              transactionHash,
              blockNumber: BigInt(blockNumber),
              createdAt: new Date(),
            },
            { transaction: t },
          ),
        ]);
      });

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

      if (
        await shouldSkipDueToReorg({
          chainId,
          blockNumber,
          eventName: "MarketSupported",
        })
      ) {
        return;
      }

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

      const marketConfigValues = await fetchMarketConfigValues({
        chainId,
        interestRateModelAddress,
      });

      await sequelize.transaction(async (t) => {
        if (!asset.isSupported) {
          await dbClient.asset.update(
            { isSupported: true },
            {
              where: { assetAddress, chainId },
              transaction: t,
            },
          );
        }

        const [updatedRows] = await dbClient.assetConfig.update(
          marketConfigValues,
          {
            where: { assetId: asset.id },
            transaction: t,
          },
        );

        if (updatedRows === 0) {
          await dbClient.assetConfig.create(
            {
              id: idUtils.generateId(),
              assetId: asset.id,
              ...marketConfigValues,
            },
            { transaction: t },
          );
        }
      });

      logger.info("MarketSupported processed: TX {transactionHash}", {
        transactionHash,
      });
    } catch (error) {
      logger.error("Error handling MarketSupported event {error}", {
        error: (error as Error).message,
        payload: params,
      });
      throw error;
    }
  }

  async function handleDonateJob(params: IDonatedEventReq) {
    try {
      const {
        chainId,
        donorAddress,
        assetAddress,
        amount,
        transactionHash,
        blockNumber,
      } = params;

      if (
        await shouldSkipDueToReorg({
          chainId,
          blockNumber,
          eventName: "Donated",
        })
      ) {
        return;
      }

      logger.info(
        "Donated event received on {chainId}: donor {donorAddress}, asset {assetAddress}, amount {amount}, tx {transactionHash}, block {blockNumber}",
        {
          chainId,
          donorAddress,
          assetAddress,
          amount,
          transactionHash,
          blockNumber,
        },
      );

      const asset = await ensureAsset(assetAddress, chainId);

      await sequelize.transaction(async (t) => {
        const balanceAfter = await updateAssetTreasuryBalanceByDelta({
          chainId,
          assetAddress,
          treasuryDelta: BigInt(amount),
          transaction: t,
        });

        await dbClient.treasuryLog.create(
          {
            id: idUtils.generateId(),
            assetId: asset.id,
            amount,
            balanceAfter,
            eventType: TreasuryEventType.Donate,
            transactionHash,
            blockNumber: BigInt(blockNumber),
            fromAddress: donorAddress,
            toAddress: null,
            createdAt: new Date(),
          },
          { transaction: t },
        );
      });

      logger.info("Donated processed: TX {transactionHash}", {
        transactionHash,
      });
    } catch (error) {
      logger.error("Error handling Donated event", {
        error: (error as Error).message,
        payload: params,
      });
      throw error;
    }
  }

  async function handleTreasuryWithdrawnJob(
    params: ITreasuryWithdrawnEventReq,
  ) {
    try {
      const {
        chainId,
        assetAddress,
        toAddress,
        amount,
        transactionHash,
        blockNumber,
      } = params;

      if (
        await shouldSkipDueToReorg({
          chainId,
          blockNumber,
          eventName: "TreasuryWithdrawn",
        })
      ) {
        return;
      }

      logger.info(
        "TreasuryWithdrawn event received on {chainId}: asset {assetAddress}, to {toAddress}, amount {amount}, tx {transactionHash}, block {blockNumber}",
        {
          chainId,
          assetAddress,
          toAddress,
          amount,
          transactionHash,
          blockNumber,
        },
      );

      const asset = await ensureAsset(assetAddress, chainId);

      await sequelize.transaction(async (t) => {
        const balanceAfter = await updateAssetTreasuryBalanceByDelta({
          chainId,
          assetAddress,
          treasuryDelta: -BigInt(amount),
          transaction: t,
        });

        await dbClient.treasuryLog.create(
          {
            id: idUtils.generateId(),
            assetId: asset.id,
            amount,
            balanceAfter,
            eventType: TreasuryEventType.Withdraw,
            transactionHash,
            blockNumber: BigInt(blockNumber),
            fromAddress: null,
            toAddress,
            createdAt: new Date(),
          },
          { transaction: t },
        );
      });

      logger.info("TreasuryWithdrawn processed: TX {transactionHash}", {
        transactionHash,
      });
    } catch (error) {
      logger.error("Error handling TreasuryWithdrawn event", {
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

      if (
        await shouldSkipDueToReorg({
          chainId,
          blockNumber,
          eventName: "MarketUnsupported",
        })
      ) {
        return;
      }

      logger.info(
        "MarketUnsupported event received on {chainId}: asset {assetAddress}, tx {transactionHash}, block {blockNumber}",
        { chainId, assetAddress, transactionHash, blockNumber },
      );

      await dbClient.asset.update(
        { isSupported: false },
        { where: { assetAddress, chainId } },
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

      if (
        await shouldSkipDueToReorg({
          chainId,
          blockNumber,
          eventName: "CollateralFactorUpdated",
        })
      ) {
        return;
      }

      logger.info(
        "CollateralFactorUpdated event received on {chainId}: collateralFactor {collateralFactor}, tx {transactionHash}, block {blockNumber}",
        { chainId, collateralFactor, transactionHash, blockNumber },
      );

      await dbClient.assetConfig.update(
        { collateralFactor },
        { where: { chainId } },
      );

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

      if (
        await shouldSkipDueToReorg({
          chainId,
          blockNumber,
          eventName: "LiquidationParamsUpdated",
        })
      ) {
        return;
      }

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
        { where: { chainId } },
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
    handleDonateJob,
    handleTreasuryWithdrawnJob,
    handleMarketSupportedJob,
    handleMarketUnsupportedJob,
    handleCollateralFactorUpdatedJob,
    handleLiquidationParamsUpdatedJob,
  };
}

export type BLCWorkerHandler = ReturnType<typeof createBLCWorkerHandler>;
