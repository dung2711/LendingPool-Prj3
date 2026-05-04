import { zDate } from "src/shared/types";
import { z } from "zod";

const zLogPagination = z.object({
  take: z.coerce.number().int().positive().max(500).default(120),
  skip: z.coerce.number().int().min(0).default(0),
});

const zLogQueryBase = z.object({
  assetId: z.string().optional().describe("The ID of the asset to filter logs"),
  fromDate: zDate.describe("Start date for logs (YYYY-MM-DD)"),
  toDate: zDate.describe("End date for logs (YYYY-MM-DD)"),
  interval: z.enum(["1h", "6h", "1d", "7d"]).default("1d"),
});

const zLogQueryWithPagination = zLogQueryBase.extend(zLogPagination.shape);

export const ZAccrueLogReq = zLogQueryWithPagination;
export type IAccrueLogReq = z.infer<typeof ZAccrueLogReq>;

export const ZTreasuryLogReq = zLogQueryWithPagination;
export type ITreasuryLogReq = z.infer<typeof ZTreasuryLogReq>;
