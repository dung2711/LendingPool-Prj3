import type { Logger } from "@logtape/logtape";
import type Redis from "ioredis";
import type { Server } from "socket.io";
import type { BaseEnv } from "../config/index.js";
import type { WsEventPayload } from "./ws.types.js";

export interface WsServerDeps {
  io: Server;
  redis: Redis;
  logger: Logger;
  env: BaseEnv;
}

export function createWsServer(deps: WsServerDeps) {
  const { io, redis, logger, env } = deps;
  let isSubscribed = false;
  let subscriber: Redis | null = null;

  async function start(): Promise<void> {
    if (isSubscribed) return;

    try {
      subscriber = redis.duplicate();

      subscriber.on("message", (channel: string, message: string) => {
        if (channel !== env.WS_EVENTS_CHANNEL) return;

        try {
          const payload: WsEventPayload = JSON.parse(message);

          // Broadcast to all connected clients
          io.emit(payload.type, payload.data);

          logger.debug(
            "WebSocket event broadcasted: {type} to {count} clients",
            { type: payload.type, count: io.engine.clientsCount },
          );
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          logger.warn("Failed to parse WebSocket event: {errorMsg}", {
            errorMsg,
          });
        }
      });

      await subscriber.subscribe(env.WS_EVENTS_CHANNEL);

      isSubscribed = true;
      logger.info("WebSocket server subscribed to Redis channel");
    } catch (err) {
      if (subscriber) {
        try {
          await subscriber.quit();
        } catch {
          // Ignore cleanup errors on failed startup
        }
        subscriber = null;
      }
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error("Failed to start WebSocket server: {errorMsg}", {
        errorMsg,
      });
      throw err;
    }
  }

  io.on("connection", (socket) => {
    logger.debug("Client connected: {socketId}", { socketId: socket.id });

    socket.on("disconnect", () => {
      logger.debug("Client disconnected: {socketId}", { socketId: socket.id });
    });
  });

  async function stop(): Promise<void> {
    if (!isSubscribed) return;

    try {
      if (subscriber) {
        try {
          await subscriber.unsubscribe(env.WS_EVENTS_CHANNEL);
        } catch (unsubErr) {
          logger.debug(
            "Redis subscriber unsubscribe error (connection may be closed): {errorMsg}",
            {
              errorMsg:
                unsubErr instanceof Error ? unsubErr.message : String(unsubErr),
            },
          );
        }

        try {
          await subscriber.quit();
        } catch (quitErr) {
          logger.debug(
            "Redis subscriber quit error (connection may be closed): {errorMsg}",
            {
              errorMsg:
                quitErr instanceof Error ? quitErr.message : String(quitErr),
            },
          );
        }

        subscriber = null;
      }

      io.close();
      isSubscribed = false;
      logger.info("WebSocket server unsubscribed from Redis channel");
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.warn("Failed to stop WebSocket server: {errorMsg}", { errorMsg });
    }
  }

  return {
    start,
    stop,
  };
}

export type WsServer = ReturnType<typeof createWsServer>;
