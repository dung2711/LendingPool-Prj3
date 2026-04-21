import type { Logger } from "@logtape/logtape";
import { AdminEventType, RabbitMQEx } from "src/shared/constants";
import type {
  ProposalDetails,
  ProposalPayload,
} from "src/shared/types/proposal";
import type { RabbitMQHelperService } from "src/shared/utils";

export function createProposalPublisherService(deps: {
  rabbitMQHelper: RabbitMQHelperService;
  logger: Logger;
}) {
  const { rabbitMQHelper, logger } = deps;

  async function publish<T extends AdminEventType>(
    event: ProposalPayload<T>,
  ): Promise<void> {
    await rabbitMQHelper.publishEvent({
      exchangeName: RabbitMQEx.ADMIN_EVENTS,
      routingKey: event.type,
      event,
      logContext: {
        eventType: event.type,
        chainId: event.payload.chainId,
        safeTxHash:
          "safeTxHash" in event.payload ? event.payload.safeTxHash : undefined,
      },
    });
  }

  async function publishSafeProposed(
    payload: ProposalDetails[AdminEventType.SAFE_PROPOSED],
  ): Promise<void> {
    const event: ProposalPayload<AdminEventType.SAFE_PROPOSED> = {
      type: AdminEventType.SAFE_PROPOSED,
      payload,
    };
    await publish(event);
    logger.info(`Published SAFE_PROPOSED event for ${payload.safeTxHash}`);
  }

  async function publishSafeConfirmed(
    payload: ProposalDetails[AdminEventType.SAFE_CONFIRMED],
  ): Promise<void> {
    const event: ProposalPayload<AdminEventType.SAFE_CONFIRMED> = {
      type: AdminEventType.SAFE_CONFIRMED,
      payload,
    };
    await publish(event);
    logger.info(`Published SAFE_CONFIRMED event for ${payload.safeTxHash}`);
  }

  async function publishTimelockScheduled(
    payload: ProposalDetails[AdminEventType.TIMELOCK_SCHEDULED],
  ): Promise<void> {
    const event: ProposalPayload<AdminEventType.TIMELOCK_SCHEDULED> = {
      type: AdminEventType.TIMELOCK_SCHEDULED,
      payload,
    };
    await publish(event);
    logger.info(
      `Published TIMELOCK_SCHEDULED event for operation ${payload.operationId}`,
    );
  }

  async function publishTimelockExecuted(
    payload: ProposalDetails[AdminEventType.TIMELOCK_EXECUTED],
  ): Promise<void> {
    const event: ProposalPayload<AdminEventType.TIMELOCK_EXECUTED> = {
      type: AdminEventType.TIMELOCK_EXECUTED,
      payload,
    };
    await publish(event);
    logger.info(
      `Published TIMELOCK_EXECUTED event for operation ${payload.operationId}`,
    );
  }

  async function publishTimelockCancelled(
    payload: ProposalDetails[AdminEventType.TIMELOCK_CANCELLED],
  ): Promise<void> {
    const event: ProposalPayload<AdminEventType.TIMELOCK_CANCELLED> = {
      type: AdminEventType.TIMELOCK_CANCELLED,
      payload,
    };
    await publish(event);
    logger.info(
      `Published TIMELOCK_CANCELLED event for operation ${payload.operationId}`,
    );
  }

  return {
    publishSafeProposed,
    publishSafeConfirmed,
    publishTimelockScheduled,
    publishTimelockExecuted,
    publishTimelockCancelled,
  };
}

export type ProposalPublisherService = ReturnType<
  typeof createProposalPublisherService
>;
