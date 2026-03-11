import type { Logger } from "@logtape/logtape";
import { Sequelize } from "sequelize";
import type { BaseEnv } from "../../config/env/base";
import { createDatabaseClient, type DatabaseClient } from "./models";

export function createSequelizeClient(deps: {
  env: Pick<BaseEnv, "POSTGRES_URL" | "POSTGRESQL_QUERY_LOG_THRESHOLD">;
  logger: Logger;
}) {
  const { env, logger } = deps;
  const sequelize: Sequelize = new Sequelize(env.POSTGRES_URL, {
    dialect: "postgres",
    benchmark: true,
    logging: (sql: string, duration: number) => {
      if (duration > env.POSTGRESQL_QUERY_LOG_THRESHOLD) {
        logger.warn("Slow query detected ({duration} ms): {sql}", {
          sql,
          duration,
        });
      }
    },
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
    },
  });
  logger.info("Sequelize client created with provided PostgreSQL URL");

  return sequelize;
}

export function createPostgreSQLService(deps: {
  env: Pick<
    BaseEnv,
    "POSTGRES_URL" | "NODE_ENV" | "POSTGRESQL_QUERY_LOG_THRESHOLD"
  >;
  logger: Logger;
}) {
  const { env, logger } = deps;
  let state: {
    client: Sequelize | null;
    db: DatabaseClient | null;
    isConnecting: boolean;
  } = {
    client: null,
    db: null,
    isConnecting: false,
  };

  async function connect(): Promise<void> {
    if (state.client) {
      logger.warn("Sequelize client is already connected");
      return;
    }
    while (state.isConnecting) {
      logger.info(
        "Waiting for ongoing Sequelize connection attempt to finish...",
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (state.client) {
        logger.info("Sequelize client connected by another concurrent attempt");
        return;
      }
    }

    state.isConnecting = true;
    try {
      state.client = createSequelizeClient({ env, logger });
      await state.client.authenticate();
      logger.info("Sequelize connected successfully");
      state.db = createDatabaseClient(state.client);
      logger.info("Database client created successfully");
      if (env.NODE_ENV !== "production") {
        await state.client.sync();
        logger.info("Sequelize models synced successfully");
      }
    } catch (error) {
      logger.error("Failed to connect Sequelize: {error}", { error });
      state.client = null;
      state.db = null;
      throw error;
    } finally {
      state.isConnecting = false;
    }
  }

  function getClient(): DatabaseClient {
    if (!state.db) {
      throw new Error("Database client is not available");
    }
    return state.db;
  }

  async function close(): Promise<void> {
    if (state.client) {
      await state.client.close();
      logger.info("Sequelize connection closed");
      state.client = null;
      state.db = null;
    } else {
      logger.warn("Sequelize client is not connected, cannot close");
    }
  }

  return {
    connect,
    getClient,
    close,
  };
}
