import type { ChainId } from "src/shared/types";

export type SnapshotTaskPayload = {
  chainId: ChainId;
  snapshotBlockNumber: number;
};

export type Interval = "1h" | "6h" | "1d" | "7d";
