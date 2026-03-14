import type { Logger } from "node_modules/@logtape/logtape/dist/logger";
import type { BlockchainConfig } from "./blockchain.config";
import type { DatabaseClient } from "src/shared/infra";
import type { BlockchainEnv } from "src/shared/config";

export function createBLCIndexerService(deps: {
  blcConfig: BlockchainConfig;
  logger: Logger;
  dbClient: DatabaseClient;
  env: BlockchainEnv;
}) {
  const { blcConfig, logger, dbClient, env } = deps;
}
