import { Baker, RedisPersistenceProvider } from "cronbake";
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

const baker = Baker.create({
  logger,
  persistence: {
    enabled: true,
    strategy: "redis",
    provider: new RedisPersistenceProvider({
      client: redisClient,
      key: "blc-indexer:state",
    }),
    autoRestore: true,
  },
});

baker.add({
  name: "scan-ethereum-network",
  cron: "@every_12_seconds",
  persist: true,
  callback: async () => {
    logger.info("Cron job scan Ethereum network");
    try {
      await blcIndexerService.scanChain(chainIds.sepolia);
    } catch (error) {
      logger.error("Error scanning Ethereum network {error}", { error });
    }
  },
});

baker.add({
  name: "check-liquidatable-users",
  cron: "@every_30_seconds",
  persist: true,
  callback: async () => {
    logger.info("Cron job checking liquidatable users");
    try {
      await liquidatableUsersService.calculateLiquidatableUsers();
    } catch (error) {
      logger.error("Error checking liquidatable users {error}", { error });
    }
  },
});

baker.bakeAll();

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
