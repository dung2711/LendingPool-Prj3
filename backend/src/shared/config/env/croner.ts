import { z } from "zod";
import { blockchainEnvSchema } from "./blockchain";

const zEvmAddress = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid EVM address");

export const cronerEnvSchema = blockchainEnvSchema.extend({
  SNAPSHOT_BATCH_SIZE: z.coerce
    .number()
    .default(1000)
    .describe("Number of records to process in each snapshot batch"),
  SAFE_API_KEY: z.string().describe("API key for Safe transaction service"),
  SAFE_ADDRESS: zEvmAddress.describe("Safe contract address to monitor"),
});

export type CronerEnv = z.infer<typeof cronerEnvSchema>;
