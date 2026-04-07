import { Cron } from "croner";
import dotenv from "dotenv";
import { createBlockchainConfig } from "src/modules/blockchain";
import { setupInfrastructure } from "src/shared/bootstrap/common-setup";
import { cronerEnvSchema, validateEnv } from "src/shared/config";
import { chainIds } from "src/shared/constants";
import { createRabbitMQHelperService, IdUtils } from "src/shared/utils";
import {
  createSnapshotConsumerService,
  createSnapshotHandler,
  createSnapshotPublisherService,
} from "../../modules/snapshots";

dotenv.config();

const env = validateEnv(cronerEnvSchema);
const { logger, dbClient, rabbitChannel, sequelize, cleanup } =
  await setupInfrastructure(env, "croner");
const blcConfig = createBlockchainConfig({ env, logger });
const idUtils = new IdUtils();

const snapshotHandler = createSnapshotHandler({
  logger,
  sequelize,
  dbClient,
  env,
  blcConfig,
  idUtils,
});
const rabbitMQHelperService = createRabbitMQHelperService({
  logger,
  rabbitChannel,
});
const snapshotConsumerService = createSnapshotConsumerService({
  snapshotHandler,
  rabbitMQHelperService,
});
const snapshotPublisherService = createSnapshotPublisherService({
  rabbitMQHelperService,
});

await snapshotConsumerService.start();

const snapshotSepoliaCron = new Cron(
  "0 10 0 * * *",
  {
    name: "snapshot-sepolia",
    timezone: "UTC",
    protect: true,
  },
  async () => {
    logger.info("Publishing snapshot tasks for Sepolia");
    try {
      const snapshotBlockNumber = await blcConfig
        .getProvider(chainIds.sepolia)
        .getBlockNumber();

      await snapshotPublisherService.publishSnapshotTasks({
        chainId: chainIds.sepolia,
        snapshotBlockNumber,
      });
    } catch (error) {
      logger.error("Failed to publish snapshot tasks for Sepolia {error}", {
        error,
      });
    }
  },
);

async function shutdown() {
  snapshotSepoliaCron.stop();
  await cleanup();
  process.exit(0);
}

let isShuttingDown = false;

process.on("SIGINT", async () => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info("Shutting down gracefully...");
  await shutdown();
});

process.on("SIGTERM", async () => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info("Shutting down gracefully...");
  await shutdown();
});
