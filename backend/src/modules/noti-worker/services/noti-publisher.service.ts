import type { Logger } from "@logtape/logtape";
import { RabbitMQEx, RabbitMQQueue } from "src/shared/constants";
import type { EmailEvent } from "src/shared/types/notification";
import type { RabbitMQHelperService } from "src/shared/utils";

export function createNotiPublisherService(deps: {
  rabbitMQHelper: RabbitMQHelperService;
  logger: Logger;
}) {
  const { rabbitMQHelper, logger } = deps;

  async function publishEmailEvent(event: EmailEvent): Promise<void> {
    await rabbitMQHelper.publishEvent({
      exchangeName: RabbitMQEx.NOTI_EVENTS,
      routingKey: RabbitMQQueue.NOTI_EMAIL,
      event,
      logContext: {
        eventType: event.type,
      },
    });
    logger.info(`Published email event of type ${event.type}`);
  }

  return {
    publishEmailEvent,
  };
}

export type NotiPublisherService = ReturnType<
  typeof createNotiPublisherService
>;
