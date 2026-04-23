import { z } from "zod";
import { baseEnvSchema } from "./base";

export const notiWorkerEnvSchema = baseEnvSchema.extend({
  EMAIL_USER: z
    .string()
    .describe("Email address used for sending notifications"),
  EMAIL_APP_PASS: z.string().describe("App password for the email account"),
  EMAIL_FROM: z
    .string()
    .optional()
    .describe("Optional sender identity used in From header"),
  EMAIL_SUPPORT_EMAIL: z
    .string()
    .optional()
    .describe("Support email shown in templates"),
  EMAIL_BRAND_PRIMARY_COLOR: z
    .string()
    .default("#2563eb")
    .describe("Primary brand color in hex format, e.g. #2563eb"),
  COMPANY_NAME: z
    .string()
    .default("Our Company")
    .describe("Company name used in email templates"),
  ADMIN_NOTI_BATCH_SIZE: z.coerce
    .number()
    .int()
    .positive()
    .default(500)
    .describe(
      "Number of emails to publish in one batch for admin notifications",
    ),
});

export type NotiWorkerEnv = z.infer<typeof notiWorkerEnvSchema>;
