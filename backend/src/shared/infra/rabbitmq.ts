import type { Logger } from "@logtape/logtape";
import {
  type AmqpConnectionManager,
  type ChannelWrapper,
  connect as createConnectionManager,
} from "amqp-connection-manager";
import type { Channel } from "amqplib";
import type { BaseEnv } from "../config";

export function createRabbitMQService(deps: {
  env: Pick<BaseEnv, "RABBITMQ_URL">;
  logger: Logger;
}) {
  const { env, logger } = deps;
  const state: {
    connectionManager: AmqpConnectionManager | null;
    channelWrapper: ChannelWrapper | null;
    isConnecting: boolean;
  } = {
    connectionManager: null,
    channelWrapper: null,
    isConnecting: false,
  };

  async function createConnection() {
    const connectionManager = createConnectionManager(env.RABBITMQ_URL, {
      reconnectTimeInSeconds: 5,
      heartbeatIntervalInSeconds: 5,
    });

    connectionManager.on("connect", () => {
      logger.info("RabbitMQ connected successfully");
    });

    connectionManager.on("disconnect", ({ err }: { err?: Error }) => {
      logger.warn("RabbitMQ disconnected", { error: err?.message });
    });

    connectionManager.on("connectFailed", ({ err }: { err?: Error }) => {
      logger.error("RabbitMQ connection failed", {
        error: err?.message,
      });
    });

    const channelWrapper = connectionManager.createChannel({
      setup: (_: Channel) => {
        logger.info("RabbitMQ channel setup completed");
      },
    });

    await channelWrapper.waitForConnect();
    logger.info("RabbitMQ channel created successfully");

    return { connectionManager, channelWrapper };
  }

  async function connect(): Promise<void> {
    if (state.channelWrapper && state.connectionManager) {
      return;
    }

    if (state.isConnecting) {
      while (state.isConnecting) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (state.channelWrapper) {
          return;
        }
      }
    }

    state.isConnecting = true;

    try {
      const { connectionManager, channelWrapper } = await createConnection();
      state.connectionManager = connectionManager;
      state.channelWrapper = channelWrapper;
      return;
    } catch (error) {
      logger.error(`Failed to connect to RabbitMQ: ${error}`);
      state.connectionManager = null;
      state.channelWrapper = null;
      throw error;
    } finally {
      state.isConnecting = false;
    }
  }

  function getChannel(): ChannelWrapper {
    if (!state.channelWrapper) {
      throw new Error(
        "RabbitMQ channel not initialized. Call connect() first.",
      );
    }
    return state.channelWrapper;
  }

  async function close(): Promise<void> {
    if (state.connectionManager) {
      await state.connectionManager.close();
      state.connectionManager = null;
      state.channelWrapper = null;
      logger.info("RabbitMQ connection closed");
    }
  }
  return {
    createConnection,
    connect,
    getChannel,
    close,
  };
}
