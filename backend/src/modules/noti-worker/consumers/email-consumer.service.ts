import type { Logger } from "@logtape/logtape";
import { EmailPurpose, RabbitMQEx, RabbitMQQueue } from "src/shared/constants";
import type { EmailEvent } from "src/shared/types";
import type { RabbitMQHelperService } from "src/shared/utils";
import type { EmailService } from "../../email/services/email.service";

export function createEmailConsumerService(deps: {
  rabbitMQHelper: RabbitMQHelperService;
  emailService: EmailService;
  logger: Logger;
}) {
  const { rabbitMQHelper, emailService, logger } = deps;

  async function start() {
    await rabbitMQHelper.setupQueue<EmailEvent>({
      mainEx: RabbitMQEx.NOTI_EVENTS,
      queueName: RabbitMQQueue.NOTI_EMAIL,
      action: (payload) => handleEmailEvent(payload),
    });
  }

  async function handleEmailEvent(event: EmailEvent): Promise<void> {
    logger.info("Received email event", {
      type: event.type,
    });
    switch (event.type) {
      case EmailPurpose.OTP:
        await emailService.sendOTPEmail(event.payload);
        break;
      case EmailPurpose.AdminNotification:
        await emailService.sendAdminNotiEmail(event.payload);
        break;
    }
  }

  return {
    start,
  };
}
