import { zDate } from "src/shared/types";
import { z } from "zod";

const zLogQueryBase = z.object({
  assetId: z.string().optional().describe("The ID of the asset to filter logs"),
  fromDate: zDate.describe("Start date for logs (YYYY-MM-DD)"),
  toDate: zDate.describe("End date for logs (YYYY-MM-DD)"),
  limit: z.coerce.number().int().positive().max(500).default(120),
  interval: z.enum(["1h", "6h", "1d", "7d"]).default("1d"),
});

export const ZAccrueLogReq = zLogQueryBase;
export type IAccrueLogReq = z.infer<typeof ZAccrueLogReq>;

export const ZTreasuryLogReq = zLogQueryBase;
export type ITreasuryLogReq = z.infer<typeof ZTreasuryLogReq>;
