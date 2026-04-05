import {
  type AppName,
  type BaseEnv,
  configureLogger,
  getAppLogger,
} from "../config";
import {
  createPostgreSQLService,
  createRabbitMQService,
  createRedisService,
} from "../infra";

export async function setupInfrastructure<T extends BaseEnv>(
  env: T,
  appName: AppName,
) {
  await configureLogger({ env, appName });
  const logger = getAppLogger(appName);

  const dbService = createPostgreSQLService({ env, logger });
  await dbService.connect();
  const sequelize = dbService.getSequelizeInstance();
  const dbClient = dbService.getClient();

  const rabbitService = createRabbitMQService({ env, logger });
  await rabbitService.connect();
  const rabbitChannel = rabbitService.getChannel();

  const redisService = createRedisService({ env, logger });
  await redisService.connect();
  const redisClient = redisService.getClient();

  async function cleanup() {
    try {
      logger.info("Shutting down database connection...");
      await dbService.close();
    } catch (error) {
      logger.warn("Failed to close Postgres connection {error}", { error });
    }
    try {
      logger.info("Shutting down RabbitMQ connection...");
      await rabbitService.close();
    } catch (error) {
      logger.warn("Failed to close RabbitMQ connection {error}", { error });
    }
    try {
      logger.info("Shutting down Redis connection...");
      await redisService.close();
    } catch (error) {
      logger.warn("Failed to close Redis connection {error}", { error });
    }
  }

  return {
    logger,
    sequelize,
    dbClient,
    rabbitChannel,
    redisClient,
    cleanup,
  };
}

export type InfrastructureServices = Awaited<
  ReturnType<typeof setupInfrastructure>
>;
