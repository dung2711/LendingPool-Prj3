import type { ChainId } from "src/shared/types";

export type SnapshotTaskPayload = {
  chainId: ChainId;
  snapshotBlockNumber: number;
};
