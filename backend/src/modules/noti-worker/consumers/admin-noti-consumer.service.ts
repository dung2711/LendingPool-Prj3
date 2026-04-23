import type { Logger } from "@logtape/logtape";
import { Op } from "sequelize";
import type { NotiWorkerEnv } from "src/shared/config";
import {
  EmailPurpose,
  RabbitMQBindingKey,
  RabbitMQEx,
  RabbitMQQueue,
} from "src/shared/constants";
import type { DatabaseClient } from "src/shared/infra";
import type { AdminNotiEmailPayload } from "src/shared/types";
import type { ProposalEvent } from "src/shared/types/proposal";
import type { RabbitMQHelperService } from "src/shared/utils";
import type { NotiPublisherService } from "../services/noti-publisher.service";

export function createAdminNotiConsumerService(deps: {
  rabbitMQHelper: RabbitMQHelperService;
  dbClient: DatabaseClient;
  logger: Logger;
  env: NotiWorkerEnv;
  notiPublisher: NotiPublisherService;
}) {
  const { rabbitMQHelper, dbClient, logger, env, notiPublisher } = deps;

  async function start() {
    await rabbitMQHelper.setupQueue<ProposalEvent>({
      mainEx: RabbitMQEx.ADMIN_EVENTS,
      queueName: RabbitMQQueue.ADMIN_PROPOSAL_NOTI,
      bindingKey: RabbitMQBindingKey.ADMIN_BINDING_KEY,
      action: (payload) => handleAdminNotiEvent(payload),
    });
  }

  async function handleAdminNotiEvent(event: ProposalEvent): Promise<void> {
    logger.info("Received admin notification event", {
      type: event.type,
      chainId: event.payload.chainId,
    });

    const emailPayload: Omit<AdminNotiEmailPayload, "to"> = {
      eventType: event.type,
      metadata: {
        chainId: event.payload.chainId,
      },
    };

    let cursor: bigint | undefined;
    let totalPublished = 0;

    while (true) {
      const users = await dbClient.user.findAll({
        where: {
          userAddress: {
            [Op.not]: null,
          },
          email: {
            [Op.not]: null,
          },
          id: { [Op.gt]: cursor ?? 0n },
        },
        attributes: ["email", "id"],
        order: [["id", "ASC"]],
        limit: env.ADMIN_NOTI_BATCH_SIZE,
      });

      if (users.length === 0) break;

      await Promise.all(
        users.map((user) =>
          notiPublisher.publishEmailEvent({
            type: EmailPurpose.AdminNotification,
            payload: {
              to: user.email,
              ...emailPayload,
            },
          }),
        ),
      );

      cursor = users[users.length - 1].id;
      totalPublished += users.length;
      logger.info(
        `Published admin notification email events for ${users.length} users (total so far: ${totalPublished})`,
      );
    }
  }

  return {
    start,
  };
}
