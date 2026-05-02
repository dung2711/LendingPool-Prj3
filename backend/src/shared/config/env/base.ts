import { z } from "zod";
import { LogLevel, NodeEnv } from "../../constants";

export const baseEnvSchema = z.object({
  NODE_ENV: z
    .enum(NodeEnv)
    .default(NodeEnv.Development)
    .describe("Node environment"),
  PORT: z.coerce.number().default(4000).describe("Port to run the server on"),
  LOG_LEVEL: z.enum(LogLevel).default(LogLevel.Info).describe("Logging level"),
  POSTGRES_URL: z.url().describe("Postgres connection URL"),
  POSTGRESQL_QUERY_LOG_THRESHOLD: z.coerce
    .number()
    .default(400)
    .describe("Postgres query log threshold in milliseconds"),
  RABBITMQ_URL: z.url().describe("RabbitMQ connection URL"),
  REDIS_URL: z.url().describe("Redis connection URL"),
  WS_EVENTS_CHANNEL: z
    .string()
    .default("lending-pool:ws:events")
    .describe("Redis channel for WebSocket events"),
  AUTH_NONCE_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(300)
    .describe("Wallet auth nonce TTL in seconds"),
  JWT_ACCESS_TOKEN_SECRET: z
    .string()
    .min(32)
    .default("dev-access-token-secret-change-this-value")
    .describe("JWT access token secret"),
  JWT_ACCESS_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(900)
    .describe("JWT access token TTL in seconds"),
  JWT_REFRESH_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60 * 24 * 30)
    .describe("Refresh token TTL in seconds"),
  JWT_ISSUER: z.string().default("lending-pool-prj3").describe("JWT issuer"),
  JWT_AUDIENCE: z
    .string()
    .default("lending-pool-prj3-users")
    .describe("JWT audience"),
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
