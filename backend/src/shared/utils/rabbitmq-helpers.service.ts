import type { Channel, ChannelWrapper } from "amqp-connection-manager";
import type { Logger } from "@logtape/logtape";
import type { RabbitMQEx } from "../constants";

export function createRabbitMQHelperService(deps: {
  logger: Logger;
  rabbitChannel: ChannelWrapper;
}) {
  const { logger, rabbitChannel } = deps;
  const RETRY_DELAYS_MS = [5_000, 30_000, 120_000];

  async function setupQueue<T>({
    mainEx,
    queueName,
    action,
    retryDelays = RETRY_DELAYS_MS,
  }: {
    mainEx: RabbitMQEx;
    queueName: string;
    action: (event: T) => Promise<void> | void;
    retryDelays?: number[];
  }): Promise<void> {
    await rabbitChannel.addSetup(async (channel: Channel) => {
      const dlxEx = `${mainEx}.dlex`;
      await channel.assertExchange(mainEx, "topic", { durable: true });
      await channel.assertExchange(dlxEx, "direct", { durable: true });

      await channel.assertQueue(queueName, {
        durable: true,
        arguments: { "x-dead-letter-exchange": dlxEx },
      });

      await channel.bindQueue(queueName, mainEx, "#");

      for (let i = 0; i < retryDelays.length; i++) {
        const retryQueue = `${queueName}.retry.${i}`;

        await channel.assertQueue(retryQueue, {
          durable: true,
          arguments: {
            "x-message-ttl": retryDelays[i],
            "x-dead-letter-exchange": mainEx,
            "x-dead-letter-routing-key": "#",
          },
        });

        await channel.bindQueue(retryQueue, dlxEx, `retry.${i}`);
      }

      const dlq = `${queueName}.dlq`;
      await channel.assertQueue(dlq, { durable: true });
      await channel.bindQueue(dlq, dlxEx, "failed");

      await channel.consume(queueName, async (msg) => {
        if (!msg) return;

        const headers = msg.properties.headers ?? {};
        const retryCount = Number(headers["x-retry-count"] ?? 0);

        let event: T | null = null;
        try {
          const content = msg.content.toString("utf-8");
          event = JSON.parse(content) as T;
        } catch (err) {
          logger.error("Failed to parse message content", {
            error: err,
            content: msg.content.toString("utf-8"),
          });
        }

        if (!event) {
          logger.warn(`${queueName}: invalid payload`);
          channel.ack(msg);
          return;
        }

        try {
          await action(event);
          channel.ack(msg);
        } catch (error) {
          if (retryCount < retryDelays.length) {
            logger.warn(`${queueName}: retry scheduled`, {
              retryCount,
              delayMs: retryDelays[retryCount],
            });

            channel.publish(dlxEx, `retry.${retryCount}`, msg.content, {
              headers: {
                ...headers,
                "x-retry-count": retryCount + 1,
              },
              persistent: true,
            });

            channel.ack(msg);
          } else {
            logger.error(`${queueName}: moved to DLQ`, {
              retryCount,
              error,
            });

            channel.publish(dlxEx, "failed", msg.content, {
              headers,
              persistent: true,
            });

            channel.ack(msg);
          }
        }
      });
    });
  }

  async function publishEvent<T extends { type: string }>(params: {
    exchangeName: RabbitMQEx | string;
    routingKey: string;
    event: T;
    options?: {
      persistent?: boolean;
      contentType?: string;
      headers?: Record<string, unknown>;
      messageId?: string;
      timestamp?: number;
    };
    logContext?: Record<string, unknown>;
  }): Promise<void> {
    const {
      exchangeName,
      routingKey,
      event,
      options = { persistent: true, contentType: "application/json" },
      logContext = {},
    } = params;

    try {
      const payload = Buffer.from(JSON.stringify(event), "utf-8");

      await rabbitChannel.publish(exchangeName, routingKey, payload, {
        persistent: options.persistent ?? true,
        contentType: options.contentType ?? "application/json",
        headers: options.headers,
        messageId: options.messageId,
        timestamp: options.timestamp,
      });

      logger.info(`Published ${event.type} event`, {
        ...logContext,
        exchange: exchangeName,
        routingKey,
      });
    } catch (error) {
      logger.error(`Failed to publish ${event.type} event`, {
        error,
        ...logContext,
        exchange: exchangeName,
        routingKey,
      });
      throw error;
    }
  }

  return {
    setupQueue,
    publishEvent,
  };
}
