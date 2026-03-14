import {
  type AppName,
  type BaseEnv,
  configureLogger,
  getAppLogger,
} from "../config";
import { createPostgreSQLService, createRabbitMQService } from "../infra";

export async function setupInfrastructure<T extends BaseEnv>(
  env: T,
  appName: AppName,
) {
  await configureLogger({ env, appName });
  const logger = getAppLogger(appName);

  const dbService = createPostgreSQLService({ env, logger });
  await dbService.connect();
  const dbClient = dbService.getClient();

  const rabbitService = createRabbitMQService({ env, logger });
  await rabbitService.connect();
  const rabbitChannel = rabbitService.getChannel();

  async function cleanup() {
    try {
      await dbService.close();
    } catch (error) {
      logger.warn("Failed to close Postgres connection {error}", { error });
    }
    try {
      await rabbitService.close();
    } catch (error) {
      logger.warn("Failed to close RabbitMQ connection {error}", { error });
    }
  }

  return {
    logger,
    dbClient,
    rabbitChannel,
    cleanup,
  };
}

export type InfrastructureServices = Awaited<
  ReturnType<typeof setupInfrastructure>
>;
