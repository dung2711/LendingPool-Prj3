import { RabbitMQEx, RabbitMQQueue } from "src/shared/constants";
import type { RabbitMQHelperService } from "src/shared/utils";
import type { SnapshotTaskPayload } from "./snapshot.types";

export function createSnapshotPublisherService(deps: {
  rabbitMQHelperService: RabbitMQHelperService;
}) {
  const { rabbitMQHelperService } = deps;

  async function publishSnapshotTasks(payload: SnapshotTaskPayload) {
    await Promise.all([
      rabbitMQHelperService.publishEvent({
        exchangeName: RabbitMQEx.CRONNER_EVENTS,
        routingKey: RabbitMQQueue.CRONNER_ASSET_SNAPSHOT,
        event: payload,
        logContext: {
          chainId: payload.chainId,
          snapshotType: "asset",
          snapshotBlockNumber: payload.snapshotBlockNumber,
        },
      }),
      rabbitMQHelperService.publishEvent({
        exchangeName: RabbitMQEx.CRONNER_EVENTS,
        routingKey: RabbitMQQueue.CRONNER_USER_SNAPSHOT,
        event: payload,
        logContext: {
          chainId: payload.chainId,
          snapshotType: "user",
          snapshotBlockNumber: payload.snapshotBlockNumber,
        },
      }),
    ]);
  }

  return { publishSnapshotTasks };
}

export type SnapshotPublisherService = ReturnType<
  typeof createSnapshotPublisherService
>;
