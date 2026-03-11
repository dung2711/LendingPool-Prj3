import { z } from "zod";
import { LogLevel, NodeEnv } from "../../constants";

export const baseEnvSchema = z.object({
  NODE_ENV: z
    .enum(NodeEnv)
    .default(NodeEnv.Development)
    .describe("Node environment"),
  LOG_LEVEL: z.enum(LogLevel).default(LogLevel.Info).describe("Logging level"),
  POSTGRES_URL: z.url().describe("Postgres connection URL"),
  POSTGRESQL_QUERY_LOG_THRESHOLD: z.coerce
    .number()
    .default(400)
    .describe("Postgres query log threshold in milliseconds"),
});

export type BaseEnv = z.infer<typeof baseEnvSchema>;

export function validateEnv<T extends z.ZodTypeAny>(
  schema: T,
  source: unknown = process.env,
): z.infer<T> {
  const result = schema.safeParse(source);

  if (!result.success) {
    console.error("[env] Environment validation failed:");

    result.error.issues.forEach((issue) => {
      console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    });

    throw new Error("Invalid environment variables");
  }

  return result.data;
}
