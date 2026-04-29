import { zDate } from "src/shared/types";
import z from "zod";

export const ZAssetSnapshotReq = z.object({
  assetId: z.string().describe("The ID of the asset to snapshot"),
  fromDate: zDate.describe("Start date for the snapshot (YYYY-MM-DD)"),
  toDate: zDate.describe("End date for the snapshot (YYYY-MM-DD)"),
  interval: z
    .enum(["1h", "6h", "1d", "7d"])
    .default("1d")
    .describe("Interval for the snapshot data"),
});

export type IAssetSnapshotReq = z.infer<typeof ZAssetSnapshotReq>;

export const ZUserSnapshotReq = z.object({
  userId: z.string().describe("The ID of the user to snapshot"),
  fromDate: zDate.describe("Start date for the snapshot (YYYY-MM-DD)"),
  toDate: zDate.describe("End date for the snapshot (YYYY-MM-DD)"),
  interval: z
    .enum(["1h", "6h", "1d", "7d"])
    .default("1d")
    .describe("Interval for the snapshot data"),
});

export type IUserSnapshotReq = z.infer<typeof ZUserSnapshotReq>;
