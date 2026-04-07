import { z } from "zod";
import { blockchainEnvSchema } from "./blockchain";

export const cronerEnvSchema = blockchainEnvSchema.extend({
  SNAPSHOT_BATCH_SIZE: z.coerce
    .number()
    .default(1000)
    .describe("Number of records to process in each snapshot batch"),
});

export type CronerEnv = z.infer<typeof cronerEnvSchema>;
