import type { Logger } from "@logtape/logtape";
import type { EventLog } from "ethers";
import type { ProposalPublisherService } from "src/modules/proposals";
import {
  type AdminEventType,
  RabbitMQEx,
  RabbitMQQueue,
  ZERO_BYTES32,
} from "src/shared/constants";
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
} from "src/shared/types/blockchain";
import type { ProposalDetails } from "src/shared/types/proposal";
import type { RabbitMQHelperService } from "src/shared/utils";

export function createBlockchainService(deps: {
  rabbitHelper: RabbitMQHelperService;
  proposalPublisher: ProposalPublisherService;
  logger: Logger;
}) {
  const { rabbitHelper, proposalPublisher, logger } = deps;

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
      logIndex: event.index,
      publishedAt: Date.now(),
    };
  }

  function logHandleInvocation(params: {
    handlerName: string;
    chainId: ChainId;
    event: EventLog;
    details: Record<string, unknown>;
  }) {
    const { handlerName, chainId, event, details } = params;
    logger.info("Handling blockchain event", {
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
    const {
      asset,
      interestAccrued,
      toDepositors,
      toTreasury,
      totalTreasury,
      newTotalBorrows,
      newBorrowIndex,
      newTotalDeposits,
      newDepositIndex,
    } = event.args;
    logHandleInvocation({
      handlerName: "handleAccrueEvent",
      chainId,
      event,
      details: {
        assetAddress: asset,
        interestAccrued: interestAccrued.toString(),
        toDepositors: toDepositors.toString(),
        toTreasury: toTreasury.toString(),
        totalTreasury: totalTreasury.toString(),
        newTotalBorrows: newTotalBorrows.toString(),
        newBorrowIndex: newBorrowIndex.toString(),
        newTotalDeposits: newTotalDeposits.toString(),
        newDepositIndex: newDepositIndex.toString(),
      },
    });
    await publishEvent<IAccrueEventReq>({
      chainId,
      event,
      queueName: RabbitMQQueue.BLOCKCHAIN_ACCRUE_INTEREST,
      payload: {
        chainId,
        assetAddress: asset,
        interestAccrued: interestAccrued.toString(),
        toDepositors: toDepositors.toString(),
        toTreasury: toTreasury.toString(),
        totalTreasury: totalTreasury.toString(),
        newTotalBorrows: newTotalBorrows.toString(),
        newBorrowIndex: newBorrowIndex.toString(),
        newTotalDeposits: newTotalDeposits.toString(),
        newDepositIndex: newDepositIndex.toString(),
        transactionHash: event.transactionHash,
        blockNumber: event.blockNumber,
        publishedAt: Date.now(),
      },
    });
  }

  async function handleDonatedEvent({
    chainId,
    event,
  }: {
    chainId: ChainId;
    event: EventLog;
  }) {
    const { donor, asset, amount } = event.args;
    logHandleInvocation({
      handlerName: "handleDonatedEvent",
      chainId,
      event,
      details: {
        donorAddress: donor,
        assetAddress: asset,
        amount: amount.toString(),
      },
    });

    await publishEvent<IDonatedEventReq>({
      chainId,
      event,
      queueName: RabbitMQQueue.BLOCKCHAIN_TREASURY_DONATE,
      payload: {
        chainId,
        donorAddress: donor,
        assetAddress: asset,
        amount: amount.toString(),
        transactionHash: event.transactionHash,
        blockNumber: event.blockNumber,
        publishedAt: Date.now(),
      },
    });
  }

  async function handleTreasuryWithdrawnEvent({
    chainId,
    event,
  }: {
    chainId: ChainId;
    event: EventLog;
  }) {
    const { asset, to, amount } = event.args;
    logHandleInvocation({
      handlerName: "handleTreasuryWithdrawnEvent",
      chainId,
      event,
      details: {
        assetAddress: asset,
        toAddress: to,
        amount: amount.toString(),
      },
    });

    await publishEvent<ITreasuryWithdrawnEventReq>({
      chainId,
      event,
      queueName: RabbitMQQueue.BLOCKCHAIN_TREASURY_WITHDRAWN,
      payload: {
        chainId,
        assetAddress: asset,
        toAddress: to,
        amount: amount.toString(),
        transactionHash: event.transactionHash,
        blockNumber: event.blockNumber,
        publishedAt: Date.now(),
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
        publishedAt: Date.now(),
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
        publishedAt: Date.now(),
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
        publishedAt: Date.now(),
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
        publishedAt: Date.now(),
      },
    });
  }

  async function handleTimelockEvents(params: {
    chainId: ChainId;
    events: EventLog[];
  }) {
    const { chainId, events } = params;

    const saltByOperationId = new Map<string, string>();
    const pendingScheduledByOperationId = new Map<
      string,
      Omit<ProposalDetails[AdminEventType.TIMELOCK_SCHEDULED], "salt">
    >();

    for (const event of events) {
      if (event.eventName === "CallSalt") {
        const { id, salt } = event.args as unknown as {
          id: string;
          salt: string;
        };

        const operationId = String(id);
        const normalizedSalt = String(salt);
        saltByOperationId.set(operationId, normalizedSalt);

        const pendingScheduled = pendingScheduledByOperationId.get(operationId);
        if (pendingScheduled) {
          await proposalPublisher.publishTimelockScheduled({
            ...pendingScheduled,
            salt: normalizedSalt,
          });
          pendingScheduledByOperationId.delete(operationId);
        }
        continue;
      }

      if (event.eventName === "CallScheduled") {
        const { id, index, target, value, data, predecessor, delay } =
          event.args as unknown as {
            id: string;
            index: bigint;
            target: string;
            value: bigint;
            data: string;
            predecessor: string;
            delay: bigint;
          };

        const operationId = String(id);
        const txIndex = Number(index);
        if (txIndex !== 0) {
          logger.debug("Skip timelock CallScheduled because index is not 0", {
            chainId,
            operationId,
            index: txIndex,
            blockNumber: event.blockNumber,
          });
          continue;
        }

        let blockTimestampSec: number | null = null;
        try {
          const block = await event.getBlock();
          blockTimestampSec = Number(block.timestamp);
        } catch (error) {
          logger.warn(
            "Skip timelock CallScheduled because block timestamp is unavailable",
            {
              chainId,
              operationId,
              blockNumber: event.blockNumber,
              error: error instanceof Error ? error.message : String(error),
            },
          );
        }

        if (blockTimestampSec == null) {
          continue;
        }

        const parsedDelay = Number(delay);
        const scheduledPayload: Omit<
          ProposalDetails[AdminEventType.TIMELOCK_SCHEDULED],
          "salt"
        > = {
          chainId,
          operationId,
          target: String(target),
          value: value.toString(),
          calldata: String(data),
          predecessors: String(predecessor),
          delay: parsedDelay,
          eta: new Date((blockTimestampSec + parsedDelay) * 1000),
        };

        const knownSalt = saltByOperationId.get(operationId);
        if (knownSalt) {
          await proposalPublisher.publishTimelockScheduled({
            ...scheduledPayload,
            salt: knownSalt,
          });
        } else {
          pendingScheduledByOperationId.set(operationId, scheduledPayload);
        }
        continue;
      }

      if (event.eventName === "CallExecuted") {
        const { id, index } = event.args as unknown as {
          id: string;
          index: bigint;
        };

        const operationId = String(id);
        const txIndex = Number(index);
        if (txIndex !== 0) {
          logger.debug("Skip timelock CallExecuted because index is not 0", {
            chainId,
            operationId,
            index: txIndex,
            blockNumber: event.blockNumber,
          });
          continue;
        }

        const payload: ProposalDetails[AdminEventType.TIMELOCK_EXECUTED] = {
          chainId,
          operationId,
          timelockExecutedTxHash: event.transactionHash,
        };
        await proposalPublisher.publishTimelockExecuted(payload);
        continue;
      }

      if (event.eventName === "Cancelled") {
        const { id } = event.args as unknown as {
          id: string;
        };

        const payload: ProposalDetails[AdminEventType.TIMELOCK_CANCELLED] = {
          chainId,
          operationId: String(id),
        };
        await proposalPublisher.publishTimelockCancelled(payload);
        continue;
      }

      if (event.eventName === "MinDelayChange") {
        const { oldDuration, newDuration } = event.args as unknown as {
          oldDuration: bigint;
          newDuration: bigint;
        };

        logger.info("Timelock min delay changed", {
          chainId,
          oldDuration: oldDuration.toString(),
          newDuration: newDuration.toString(),
          blockNumber: event.blockNumber,
        });
      }
    }

    for (const payload of pendingScheduledByOperationId.values()) {
      await proposalPublisher.publishTimelockScheduled({
        ...payload,
        salt: ZERO_BYTES32,
      });
    }
  }

  return {
    handleDepositEvent,
    handleWithdrawEvent,
    handleBorrowEvent,
    handleRepayEvent,
    handleCollateralSeizedEvent,
    handleAccrueEvent,
    handleDonatedEvent,
    handleTreasuryWithdrawnEvent,
    handleMarketSupportedEvent,
    handleMarketUnsupportedEvent,
    handleCollateralFactorUpdatedEvent,
    handleLiquidationParamsUpdatedEvent,
    handleTimelockEvents,
  };
}

export type BlockchainService = ReturnType<typeof createBlockchainService>;
