import { z } from "zod";
import { ErrCode } from "../constants/error";

export const ZErrorRes = z.object({
  success: z.literal(false),
  code: z.enum(ErrCode).describe("Business error code"),
  t: z.iso.datetime().describe("Error timestamp"),
  errors: z.any().optional().describe("Detailed error information"),
});

export type IErrorRes = z.infer<typeof ZErrorRes>;
