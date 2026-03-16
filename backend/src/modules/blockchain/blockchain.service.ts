import type { Logger } from "@logtape/logtape";
import type { EventLog } from "ethers";
import { RabbitMQEx, RabbitMQQueue } from "src/shared/constants";
import type {
  ChainId,
  IAccrueEventReq,
  ICollateralFactorUpdatedEventReq,
  ILiquidationParamsUpdatedEventReq,
  IMarketSupportedEventReq,
  IMarketUnsupportedEventReq,
  ITransactionEventReq,
} from "src/shared/types/blockchain";
import type { RabbitMQHelperService } from "src/shared/utils";

export function createBlockchainService(deps: {
  rabbitHelper: RabbitMQHelperService;
  logger: Logger;
}) {
  const { rabbitHelper, logger } = deps;

  async function publishEvent<T>(params: {
    chainId: ChainId;
    event: EventLog;
    queueName: RabbitMQQueue;
    payload: T;
  }) {
    const { chainId, event, queueName, payload } = params;

    await rabbitHelper.publishEvent<T>({
      exchangeName: RabbitMQEx.BLOCKCHAIN_EVENTS,
      routingKey: queueName,
      event: payload,
      logContext: {
        eventName: event.eventName,
        chainId,
        queueName,
      },
    });

    logger.info("Published blockchain event to queue", {
      eventName: event.eventName,
      queueName,
      chainId,
      transactionHash: event.transactionHash,
      blockNumber: event.blockNumber,
    });
  }

  function createTransactionPayload(params: {
    chainId: ChainId;
    event: EventLog;
    userAddress: string;
    assetAddress: string;
    amount: bigint;
  }): ITransactionEventReq {
    const { chainId, event, userAddress, assetAddress, amount } = params;

    return {
      chainId,
      userAddress,
      assetAddress,
      amount: amount.toString(),
      transactionHash: event.transactionHash,
      blockNumber: event.blockNumber,
    };
  }

  function logHandleInvocation(params: {
    handlerName: string;
    chainId: ChainId;
    event: EventLog;
    details: Record<string, unknown>;
  }) {
    const { handlerName, chainId, event, details } = params;
    logger.debug("Handling blockchain event", {
      handlerName,
      eventName: event.eventName,
      chainId,
      transactionHash: event.transactionHash,
      blockNumber: event.blockNumber,
      ...details,
    });
  }

  async function handleDepositEvent({
    chainId,
    event,
  }: {
    chainId: ChainId;
    event: EventLog;
  }) {
    const { user, asset, amount } = event.args;
    logHandleInvocation({
      handlerName: "handleDepositEvent",
      chainId,
      event,
      details: {
        userAddress: user,
        assetAddress: asset,
        amount: amount.toString(),
      },
    });
    await publishEvent<ITransactionEventReq>({
      chainId,
      event,
      queueName: RabbitMQQueue.BLOCKCHAIN_DEPOSIT,
      payload: createTransactionPayload({
        chainId,
        event,
        userAddress: user,
        assetAddress: asset,
        amount,
      }),
    });
  }

  async function handleWithdrawEvent({
    chainId,
    event,
  }: {
    chainId: ChainId;
    event: EventLog;
  }) {
    const { user, asset, amount } = event.args;
    logHandleInvocation({
      handlerName: "handleWithdrawEvent",
      chainId,
      event,
      details: {
        userAddress: user,
        assetAddress: asset,
        amount: amount.toString(),
      },
    });
    await publishEvent<ITransactionEventReq>({
      chainId,
      event,
      queueName: RabbitMQQueue.BLOCKCHAIN_WITHDRAW,
      payload: createTransactionPayload({
        chainId,
        event,
        userAddress: user,
        assetAddress: asset,
        amount,
      }),
    });
  }

  async function handleBorrowEvent({
    chainId,
    event,
  }: {
    chainId: ChainId;
    event: EventLog;
  }) {
    const { user, asset, amount } = event.args;
    logHandleInvocation({
      handlerName: "handleBorrowEvent",
      chainId,
      event,
      details: {
        userAddress: user,
        assetAddress: asset,
        amount: amount.toString(),
      },
    });
    await publishEvent<ITransactionEventReq>({
      chainId,
      event,
      queueName: RabbitMQQueue.BLOCKCHAIN_BORROW,
      payload: createTransactionPayload({
        chainId,
        event,
        userAddress: user,
        assetAddress: asset,
        amount,
      }),
    });
  }

  async function handleRepayEvent({
    chainId,
    event,
  }: {
    chainId: ChainId;
    event: EventLog;
  }) {
    const { user, asset, amount } = event.args;
    logHandleInvocation({
      handlerName: "handleRepayEvent",
      chainId,
      event,
      details: {
        userAddress: user,
        assetAddress: asset,
        amount: amount.toString(),
      },
    });
    await publishEvent<ITransactionEventReq>({
      chainId,
      event,
      queueName: RabbitMQQueue.BLOCKCHAIN_REPAY,
      payload: createTransactionPayload({
        chainId,
        event,
        userAddress: user,
        assetAddress: asset,
        amount,
      }),
    });
  }

  async function handleCollateralSeizedEvent({
    chainId,
    event,
  }: {
    chainId: ChainId;
    event: EventLog;
  }) {
    const { borrower, collateralAsset, seizeAmount } = event.args;
    logHandleInvocation({
      handlerName: "handleCollateralSeizedEvent",
      chainId,
      event,
      details: {
        userAddress: borrower,
        assetAddress: collateralAsset,
        amount: seizeAmount.toString(),
      },
    });
    await publishEvent<ITransactionEventReq>({
      chainId,
      event,
      queueName: RabbitMQQueue.BLOCKCHAIN_LIQUIDATE,
      payload: createTransactionPayload({
        chainId,
        event,
        userAddress: borrower,
        assetAddress: collateralAsset,
        amount: seizeAmount,
      }),
    });
  }

  async function handleAccrueEvent({
    chainId,
    event,
  }: {
    chainId: ChainId;
    event: EventLog;
  }) {
    const { asset, newTotalBorrows, newTotalDeposits } = event.args;
    logHandleInvocation({
      handlerName: "handleAccrueEvent",
      chainId,
      event,
      details: {
        assetAddress: asset,
        newTotalBorrows: newTotalBorrows.toString(),
        newTotalDeposits: newTotalDeposits.toString(),
      },
    });
    await publishEvent<IAccrueEventReq>({
      chainId,
      event,
      queueName: RabbitMQQueue.BLOCKCHAIN_ACCRUE_INTEREST,
      payload: {
        chainId,
        assetAddress: asset,
        newTotalBorrows: newTotalBorrows.toString(),
        newTotalDeposits: newTotalDeposits.toString(),
        transactionHash: event.transactionHash,
        blockNumber: event.blockNumber,
      },
    });
  }

  async function handleMarketSupportedEvent({
    chainId,
    event,
  }: {
    chainId: ChainId;
    event: EventLog;
  }) {
    const { asset, interestRateModel } = event.args;
    logHandleInvocation({
      handlerName: "handleMarketSupportedEvent",
      chainId,
      event,
      details: {
        assetAddress: asset,
        interestRateModelAddress: interestRateModel,
      },
    });
    await publishEvent<IMarketSupportedEventReq>({
      chainId,
      event,
      queueName: RabbitMQQueue.BLOCKCHAIN_MARKET_SUPPORTED,
      payload: {
        chainId,
        assetAddress: asset,
        interestRateModelAddress: interestRateModel,
        transactionHash: event.transactionHash,
        blockNumber: event.blockNumber,
      },
    });
  }

  async function handleMarketUnsupportedEvent({
    chainId,
    event,
  }: {
    chainId: ChainId;
    event: EventLog;
  }) {
    const { asset } = event.args;
    logHandleInvocation({
      handlerName: "handleMarketUnsupportedEvent",
      chainId,
      event,
      details: {
        assetAddress: asset,
      },
    });
    await publishEvent<IMarketUnsupportedEventReq>({
      chainId,
      event,
      queueName: RabbitMQQueue.BLOCKCHAIN_MARKET_UNSUPPORTED,
      payload: {
        chainId,
        assetAddress: asset,
        transactionHash: event.transactionHash,
        blockNumber: event.blockNumber,
      },
    });
  }

  async function handleCollateralFactorUpdatedEvent({
    chainId,
    event,
  }: {
    chainId: ChainId;
    event: EventLog;
  }) {
    const { newCollateralFactor } = event.args;
    logHandleInvocation({
      handlerName: "handleCollateralFactorUpdatedEvent",
      chainId,
      event,
      details: {
        collateralFactor: newCollateralFactor.toString(),
      },
    });
    await publishEvent<ICollateralFactorUpdatedEventReq>({
      chainId,
      event,
      queueName: RabbitMQQueue.BLOCKCHAIN_COLLATERAL_FACTOR_UPDATED,
      payload: {
        chainId,
        collateralFactor: newCollateralFactor.toString(),
        transactionHash: event.transactionHash,
        blockNumber: event.blockNumber,
      },
    });
  }

  async function handleLiquidationParamsUpdatedEvent({
    chainId,
    event,
  }: {
    chainId: ChainId;
    event: EventLog;
  }) {
    const { closeFactor, liquidationIncentive, liquidationThreshold } =
      event.args;
    logHandleInvocation({
      handlerName: "handleLiquidationParamsUpdatedEvent",
      chainId,
      event,
      details: {
        closeFactor: closeFactor.toString(),
        liquidationIncentive: liquidationIncentive.toString(),
        liquidationThreshold: liquidationThreshold.toString(),
      },
    });
    await publishEvent<ILiquidationParamsUpdatedEventReq>({
      chainId,
      event,
      queueName: RabbitMQQueue.BLOCKCHAIN_LIQUIDATION_PARAMS_UPDATED,
      payload: {
        chainId,
        closeFactor: closeFactor.toString(),
        liquidationIncentive: liquidationIncentive.toString(),
        liquidationThreshold: liquidationThreshold.toString(),
        transactionHash: event.transactionHash,
        blockNumber: event.blockNumber,
      },
    });
  }

  return {
    handleDepositEvent,
    handleWithdrawEvent,
    handleBorrowEvent,
    handleRepayEvent,
    handleCollateralSeizedEvent,
    handleAccrueEvent,
    handleMarketSupportedEvent,
    handleMarketUnsupportedEvent,
    handleCollateralFactorUpdatedEvent,
    handleLiquidationParamsUpdatedEvent,
  };
}

export type BlockchainService = ReturnType<typeof createBlockchainService>;
