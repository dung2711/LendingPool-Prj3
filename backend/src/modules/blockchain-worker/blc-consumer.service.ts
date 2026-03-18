import type { Logger } from "@logtape/logtape";
import { RabbitMQEx, RabbitMQQueue } from "src/shared/constants";
import type { RabbitMQHelperService } from "src/shared/utils";
import type { BLCWorkerHandler } from "./blc-worker.handler";

type QueueAction<TEvent> = (event: TEvent) => Promise<void> | void;

export function createBLCConsumerService(deps: {
  rabbitHelper: RabbitMQHelperService;
  blcWorkerHandler: BLCWorkerHandler;
  logger: Logger;
}) {
  const { rabbitHelper, blcWorkerHandler, logger } = deps;

  async function start() {
    const setupQueue = async <TEvent>(
      queueName: RabbitMQQueue,
      action: QueueAction<TEvent>,
    ) =>
      await rabbitHelper.setupQueue<TEvent>({
        mainEx: RabbitMQEx.BLOCKCHAIN_EVENTS,
        queueName,
        action,
      });

    const createQueueSetup = <TEvent>(
      queueName: RabbitMQQueue,
      action: QueueAction<TEvent>,
    ) => ({
      queueName,
      setup: async () => await setupQueue(queueName, action),
    });

    const queueSetups = [
      createQueueSetup(
        RabbitMQQueue.BLOCKCHAIN_DEPOSIT,
        blcWorkerHandler.handleDepositJob,
      ),
      createQueueSetup(
        RabbitMQQueue.BLOCKCHAIN_WITHDRAW,
        blcWorkerHandler.handleWithdrawJob,
      ),
      createQueueSetup(
        RabbitMQQueue.BLOCKCHAIN_BORROW,
        blcWorkerHandler.handleBorrowJob,
      ),
      createQueueSetup(
        RabbitMQQueue.BLOCKCHAIN_REPAY,
        blcWorkerHandler.handleRepayJob,
      ),
      createQueueSetup(
        RabbitMQQueue.BLOCKCHAIN_LIQUIDATE,
        blcWorkerHandler.handleCollateralSeizedJob,
      ),
      createQueueSetup(
        RabbitMQQueue.BLOCKCHAIN_ACCRUE_INTEREST,
        blcWorkerHandler.handleAccrueJob,
      ),
      createQueueSetup(
        RabbitMQQueue.BLOCKCHAIN_MARKET_SUPPORTED,
        blcWorkerHandler.handleMarketSupportedJob,
      ),
      createQueueSetup(
        RabbitMQQueue.BLOCKCHAIN_MARKET_UNSUPPORTED,
        blcWorkerHandler.handleMarketUnsupportedJob,
      ),
      createQueueSetup(
        RabbitMQQueue.BLOCKCHAIN_COLLATERAL_FACTOR_UPDATED,
        blcWorkerHandler.handleCollateralFactorUpdatedJob,
      ),
      createQueueSetup(
        RabbitMQQueue.BLOCKCHAIN_LIQUIDATION_PARAMS_UPDATED,
        blcWorkerHandler.handleLiquidationParamsUpdatedJob,
      ),
    ];

    await Promise.all(queueSetups.map((item) => item.setup()));

    logger.info("Blockchain worker queue setup completed", {
      queueCount: queueSetups.length,
      queueNames: queueSetups.map((item) => item.queueName),
    });
  }

  return {
    start,
  };
}
