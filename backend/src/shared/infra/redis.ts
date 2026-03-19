import type { Logger } from "@logtape/logtape";
import Redis from "ioredis";
import type { BaseEnv } from "../config/env";

export function createRedisService(deps: {
  env: Pick<BaseEnv, "REDIS_URL">;
  logger: Logger;
}) {
  const { env, logger } = deps;

  const state: {
    client: Redis | null;
    isConnecting: boolean;
  } = {
    client: null,
    isConnecting: false,
  };

  function createRedisClient(): Redis {
    const client = new Redis(env.REDIS_URL, {
      reconnectOnError: (err) => {
        logger.error(`Redis error: ${err}`);
        const targetError = err.toString();
        if (targetError.includes("READONLY")) return true;
        if (targetError.includes("ECONNREFUSED")) return true;
        return false;
      },
      connectTimeout: 5000,
      retryStrategy: (times) => Math.min(times * 100, 3000),
    });
    return client;
  }

  async function connect(): Promise<void> {
    if (state.client) {
      return;
    }

    if (state.isConnecting) {
      while (state.isConnecting) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (state.client) {
        return;
      }
    }

    state.isConnecting = true;

    try {
      state.client = createRedisClient();
      await state.client.ping();
      logger.info("Redis connected successfully");
      return;
    } catch (error) {
      logger.error(`Failed to connect to Redis: ${error}`);
      state.client = null;
      throw error;
    } finally {
      state.isConnecting = false;
    }
  }

  function getClient(): Redis {
    if (!state.client) {
      throw new Error("Redis client is not connected");
    }
    return state.client;
  }

  async function close(): Promise<void> {
    if (state.client) {
      await state.client.quit();
      state.client = null;
      logger.info("Redis connection closed");
    }
  }

  return {
    connect,
    getClient,
    close,
  };
}
