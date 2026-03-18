import dotenv from "dotenv";
import { createBlockchainConfig } from "../../modules/blockchain";
import {
  createBLCConsumerService,
  createBLCWorkerHandler,
} from "../../modules/blockchain-worker";
import { setupInfrastructure } from "../../shared/bootstrap/common-setup.js";
import { blockchainEnvSchema, validateEnv } from "../../shared/config/index.js";
import { createRabbitMQHelperService, IdUtils } from "../../shared/utils";

dotenv.config();

const env = validateEnv(blockchainEnvSchema);
const { logger, dbClient, rabbitChannel, cleanup } = await setupInfrastructure(
  env,
  "blc-worker",
);

const idUtils = new IdUtils();
const rabbitHelper = createRabbitMQHelperService({ rabbitChannel, logger });
const blcConfig = createBlockchainConfig({ env, logger });
const blcWorkerHandler = createBLCWorkerHandler({
  logger,
  dbClient,
  idUtils,
  blcConfig,
});
const blcConsumerService = createBLCConsumerService({
  rabbitHelper,
  blcWorkerHandler,
  logger,
});

await blcConsumerService.start();

async function shutdown() {
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
