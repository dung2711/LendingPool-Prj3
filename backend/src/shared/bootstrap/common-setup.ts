import {
  type AppName,
  type BaseEnv,
  configureLogger,
  getAppLogger,
} from "../config";
import { createPostgreSQLService } from "../infra/postgre/sequelize";

export async function setupInfrastructure<T extends BaseEnv>(
  env: T,
  appName: AppName,
) {
  await configureLogger({ env, appName });
  const logger = getAppLogger(appName);

  const dbService = createPostgreSQLService({ env, logger });
  await dbService.connect();
  const dbClient = dbService.getClient();

  async function cleanup() {
    try {
      await dbService.close();
    } catch (error) {
      logger.warn("Failed to close Postgres connection {error}", { error });
    }
  }

  return {
    logger,
    dbClient,
    cleanup,
  };
}
