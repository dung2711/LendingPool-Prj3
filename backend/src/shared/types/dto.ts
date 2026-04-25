import { z } from "zod";
import { chainIds } from "../constants";
import { ErrCode } from "../constants/error";
import type { ChainId } from "./blockchain";

export const ZErrorRes = z.object({
  success: z.literal(false),
  code: z.enum(ErrCode).describe("Business error code"),
  t: z.iso.datetime().describe("Error timestamp"),
  errors: z.any().optional().describe("Detailed error information"),
});

export type IErrorRes = z.infer<typeof ZErrorRes>;

export const zEmail = z
  .email()
  .trim()
  .toLowerCase()
  .describe("User email address");

const chainIdValues = (Object.values(chainIds) as ChainId[]).map(String) as [
  string,
  ...string[],
];

export const zChainId = z.enum(chainIdValues).describe("Chain ID");
