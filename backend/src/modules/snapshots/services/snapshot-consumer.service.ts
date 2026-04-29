import { RabbitMQEx, RabbitMQQueue } from "src/shared/constants";
import type { RabbitMQHelperService } from "src/shared/utils";
import type { SnapshotTaskPayload } from "../snapshot.types";
import type { SnapshotHandler } from "./snapshot.handler";

export function createSnapshotConsumerService(deps: {
  snapshotHandler: SnapshotHandler;
  rabbitMQHelperService: RabbitMQHelperService;
}) {
  const { snapshotHandler, rabbitMQHelperService } = deps;

  async function start() {
    await Promise.all([
      rabbitMQHelperService.setupQueue<SnapshotTaskPayload>({
        mainEx: RabbitMQEx.CRONNER_EVENTS,
        queueName: RabbitMQQueue.CRONNER_ASSET_SNAPSHOT,
        action: async (payload) => {
          await snapshotHandler.runBatchAssetSnapshot(payload);
        },
      }),
      rabbitMQHelperService.setupQueue<SnapshotTaskPayload>({
        mainEx: RabbitMQEx.CRONNER_EVENTS,
        queueName: RabbitMQQueue.CRONNER_USER_SNAPSHOT,
        action: async (payload) => {
          await snapshotHandler.runBatchUserSnapshot(payload);
        },
      }),
    ]);
  }

  return { start };
}

export type SnapshotConsumerService = ReturnType<
  typeof createSnapshotConsumerService
>;
