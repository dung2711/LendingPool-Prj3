import type { Logger } from "@logtape/logtape";
import type Redis from "ioredis";
import type { BaseEnv } from "../config/index.js";
import type { WSEvent, WsEventPayload } from "./ws.types.js";

export function createWsEventPublisher(deps: {
  redis: Redis;
  logger: Logger;
  env: BaseEnv;
}) {
  const { redis, logger, env } = deps;

  async function publish(eventType: WSEvent, data: unknown): Promise<void> {
    try {
      const payload: WsEventPayload = {
        type: eventType,
        data,
        timestamp: Date.now(),
      };

      await redis.publish(env.WS_EVENTS_CHANNEL, JSON.stringify(payload));
      logger.debug("WebSocket event published: {event}", { event: eventType });
    } catch (error) {
      logger.warn("Failed to publish WebSocket event {event}: {error}", {
        event: eventType,
        error,
      });
    }
  }

  return {
    publish,
  };
}

export type WsEventPublisher = ReturnType<typeof createWsEventPublisher>;
