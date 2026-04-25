import dotenv from "dotenv";
import nodemailer from "nodemailer";
import { createEmailService } from "src/modules/email/services/email.service";
import { createEmailConsumerService } from "src/modules/noti-worker/consumers";
import { createAdminNotiConsumerService } from "src/modules/noti-worker/consumers/admin-noti-consumer.service";
import { createNotiPublisherService } from "src/modules/noti-worker/services/noti-publisher.service";
import { createProposalConsumerService } from "src/modules/proposals";
import { setupInfrastructure } from "src/shared/bootstrap/common-setup";
import { validateEnv } from "src/shared/config/env/base";
import { notiWorkerEnvSchema } from "src/shared/config/env/noti-worker";
import { createRabbitMQHelperService } from "src/shared/utils/rabbitmq-helpers.service";

dotenv.config();

const env = validateEnv(notiWorkerEnvSchema);
const { logger, dbClient, rabbitChannel, cleanup } = await setupInfrastructure(
  env,
  "noti-worker",
);

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: env.EMAIL_USER,
    pass: env.EMAIL_APP_PASS,
  },
});
const rabbitMQHelperService = createRabbitMQHelperService({
  logger,
  rabbitChannel,
});

const proposalConsumerService = createProposalConsumerService({
  rabbitMQHelper: rabbitMQHelperService,
  dbClient,
  logger,
});

const emailService = createEmailService({
  logger,
  transporter,
  env,
});

const emailConsumerService = createEmailConsumerService({
  rabbitMQHelper: rabbitMQHelperService,
  emailService,
  logger,
});

const notiPublisherService = createNotiPublisherService({
  rabbitMQHelper: rabbitMQHelperService,
  logger,
});

const adminNotiConsumerService = createAdminNotiConsumerService({
  rabbitMQHelper: rabbitMQHelperService,
  dbClient,
  logger,
  env,
  notiPublisher: notiPublisherService,
});

await Promise.all([
  emailConsumerService.start(),
  proposalConsumerService.start(),
  adminNotiConsumerService.start(),
]);

async function shutdown() {
  await cleanup();
  process.exit(0);
}

let isShuttingDown = false;

process.on("SIGINT", async () => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info("Shutting down gracefully...");
  await shutdown();
});

process.on("SIGTERM", async () => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info("Shutting down gracefully...");
  await shutdown();
});
