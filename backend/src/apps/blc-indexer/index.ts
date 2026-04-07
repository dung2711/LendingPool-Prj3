import { Cron } from "croner";
import dotenv from "dotenv";
import { chainIds } from "src/shared/constants/blockchain.js";
import {
  createBLCIndexerService,
  createBlockchainConfig,
  createBlockchainService,
  createLiquidatableUsersService,
} from "../../modules/blockchain";
import { setupInfrastructure } from "../../shared/bootstrap/common-setup.js";
import { blockchainEnvSchema, validateEnv } from "../../shared/config/index.js";
import { createRabbitMQHelperService, IdUtils } from "../../shared/utils";
import { createWsEventPublisher } from "../../shared/ws/ws-publisher.js";

dotenv.config();

const env = validateEnv(blockchainEnvSchema);
const { logger, dbClient, rabbitChannel, redisClient, cleanup } =
  await setupInfrastructure(env, "blc-indexer");

const rabbitHelper = createRabbitMQHelperService({ rabbitChannel, logger });
const blcService = createBlockchainService({ rabbitHelper, logger });
const blcConfig = createBlockchainConfig({ env, logger });
const blcIndexerService = createBLCIndexerService({
  logger,
  dbClient,
  blcConfig,
  blcService,
  env,
});
const wsPublisher = createWsEventPublisher({
  redis: redisClient,
  logger,
  env,
});
const liquidatableUsersService = createLiquidatableUsersService({
  logger,
  wsPublisher,
  dbClient,
  blcConfig,
  idUtils: new IdUtils(),
});

await blcIndexerService.initializeScannerState();

const scanEthereumCron = new Cron(
  "*/12 * * * * *",
  { name: "scan-ethereum-network-croner" },
  async () => {
    logger.info("Cron job scan Ethereum network (Croner)");
    try {
      await blcIndexerService.scanChain(chainIds.sepolia);
    } catch (error) {
      logger.error("Error scanning Ethereum network {error}", { error });
    }
  },
);

const checkLiquidatableUsersCron = new Cron(
  "*/30 * * * * *",
  { name: "check-liquidatable-users-croner" },
  async () => {
    logger.info("Cron job checking liquidatable users (Croner)");
    try {
      await liquidatableUsersService.calculateLiquidatableUsers();
    } catch (error) {
      logger.error("Error checking liquidatable users {error}", { error });
    }
  },
);

async function shutdown() {
  logger.info("Shutting down gracefully...");
  await cleanup();
  scanEthereumCron.stop();
  checkLiquidatableUsersCron.stop();
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
