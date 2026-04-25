import type { Logger } from "@logtape/logtape";
import dayjs from "dayjs";
import type { Transporter } from "nodemailer";
import type { NotiWorkerEnv } from "src/shared/config/env/noti-worker";
import {
  AdminEventType,
  AdminNotiLevel,
  OTPPurpose,
} from "src/shared/constants";
import type {
  AdminNotiEmailPayload,
  AdminNotiTemplateCopy,
  EmailOtpPayload,
  OtpPurposeCopy,
} from "src/shared/types";
import { maskEmail } from "src/shared/utils";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getRejectedRecipients(info: unknown): string[] {
  if (!info || typeof info !== "object") {
    return [];
  }

  const rejected = (info as { rejected?: unknown }).rejected;

  if (!Array.isArray(rejected)) {
    return [];
  }

  return rejected.filter((item): item is string => typeof item === "string");
}

export function createEmailService(deps: {
  logger: Logger;
  transporter: Transporter;
  env: NotiWorkerEnv;
}) {
  const { logger, transporter, env } = deps;
  const fromEmail = env.EMAIL_FROM ?? env.EMAIL_USER;
  const supportEmail = env.EMAIL_SUPPORT_EMAIL ?? env.EMAIL_USER;
  const primaryColor = env.EMAIL_BRAND_PRIMARY_COLOR;

  function getOtpPurposeCopy(purpose: OTPPurpose): OtpPurposeCopy {
    if (purpose !== OTPPurpose.ADMIN_NOTI_SUBSCRIPTION) {
      return {
        subject: "Verify admin notification subscription",
        heading: "Admin notification verification",
        intro: `Use this OTP to verify your admin notification subscription on ${env.COMPANY_NAME}.`,
        detailLabel: "Purpose",
        detailValue: "Admin notification subscription",
        warning:
          "If you did not request this verification, you can safely ignore this email.",
      };
    }

    return {
      subject: "Verify admin notification subscription",
      heading: "Admin notification verification",
      intro: `We received a request to subscribe this email to admin notifications on ${env.COMPANY_NAME}. Use the OTP below to confirm subscription.`,
      detailLabel: "Purpose",
      detailValue: "Subscribe to admin notifications",
      warning:
        "If you did not request admin notifications, please ignore this email and review your account security settings.",
    };
  }

  function getAdminNotiCopy(eventType: AdminEventType): AdminNotiTemplateCopy {
    switch (eventType) {
      case AdminEventType.SAFE_PROPOSED:
        return {
          subject: "Safe proposal created",
          title: "New Safe proposal detected",
          message:
            "A new multisig proposal has been submitted and is waiting for confirmations.",
          level: AdminNotiLevel.Info,
        };
      case AdminEventType.SAFE_CONFIRMED:
        return {
          subject: "Safe proposal confirmed",
          title: "Safe proposal received new confirmation",
          message:
            "A multisig proposal has been confirmed by an additional signer.",
          level: AdminNotiLevel.Info,
        };
      case AdminEventType.TIMELOCK_SCHEDULED:
        return {
          subject: "Timelock operation scheduled",
          title: "Proposal entered timelock queue",
          message:
            "A timelock operation is scheduled and pending execution after the delay period.",
          level: AdminNotiLevel.Warning,
        };
      case AdminEventType.TIMELOCK_EXECUTED:
        return {
          subject: "Timelock operation executed",
          title: "Timelock operation executed successfully",
          message: "A scheduled timelock operation has been executed on-chain.",
          level: AdminNotiLevel.Info,
        };
      case AdminEventType.TIMELOCK_CANCELLED:
        return {
          subject: "Timelock operation cancelled",
          title: "Timelock operation was cancelled",
          message:
            "A scheduled timelock operation has been cancelled before execution.",
          level: AdminNotiLevel.Critical,
        };
    }
  }

  function renderEmail(payload: EmailOtpPayload): string {
    const { to, otp, purpose } = payload;
    const expiresInMinutes = Math.max(1, payload.expiresInMinutes ?? 5);
    const copy = getOtpPurposeCopy(purpose);
    const requestTime = dayjs(payload.requestedAt ?? new Date()).format(
      "YYYY-MM-DD HH:mm:ss",
    );

    return `
<!DOCTYPE html>
<html lang="en">
<head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="X-UA-Compatible" content="IE=edge">
        <title>${escapeHtml(env.COMPANY_NAME)}</title>
        <style>
                body {
                        margin: 0;
                        padding: 0;
                        background-color: #f4f7fa;
                        font-family: Helvetica, Arial, sans-serif;
                        -webkit-text-size-adjust: 100%;
                        -ms-text-size-adjust: 100%;
                }
                table {
                        border-spacing: 0;
                        border-collapse: collapse;
                }
                img {
                        border: 0;
                        display: block;
                }
        </style>
</head>
<body>
        <div style="background-color: #f4f7fa; padding: 40px; font-family: Helvetica, Arial, sans-serif;">
                <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">

                        <div style="padding: 28px 30px 8px; color: #1e293b; font-weight: 800; font-size: 28px; letter-spacing: 0.8px; text-align: center;">
                                ${escapeHtml(env.COMPANY_NAME)} SECURITY
                        </div>

                        <div style="padding: 30px;">
                                <h2 style="color: #1e293b; margin-top: 0; font-size: 22px;">${escapeHtml(copy.heading)}</h2>
                                <p style="color: #475569; font-size: 14px; line-height: 1.6;">
                                        Hi,<br>
                                        ${escapeHtml(copy.intro)}
                                </p>

                                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; margin: 20px 0; font-size: 13px; color: #64748b;">
                                        <div style="margin-bottom: 8px; color: #1e293b; font-weight: bold; font-size: 11px; letter-spacing: 0.5px;">REQUEST DETAILS</div>
                                        <div style="margin-bottom: 4px;"><strong>Account:</strong> ${escapeHtml(to)}</div>
                                        <div style="margin-bottom: 4px;"><strong>${escapeHtml(copy.detailLabel)}:</strong> ${escapeHtml(copy.detailValue)}</div>
                                        <div style="margin-bottom: 4px;"><strong>Time:</strong> ${escapeHtml(requestTime)}</div>
                                </div>

                                <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 30px; text-align: center; margin: 25px 0;">
                                        <div style="font-size: 11px; color: ${primaryColor}; font-weight: bold; letter-spacing: 1.5px; margin-bottom: 10px; text-transform: uppercase;">One-Time Password (OTP)</div>
                                        <div style="font-size: 42px; font-weight: 800; color: ${primaryColor}; letter-spacing: 10px; font-family: 'Courier New', Courier, monospace;">${escapeHtml(otp)}</div>
                                        <div style="font-size: 11px; color: #64748b; margin-top: 15px;">This code will expire in ${expiresInMinutes} minute${expiresInMinutes > 1 ? "s" : ""}. <strong>Do not share it with anyone</strong>, including our support team.</div>
                                </div>

                                <div style="background: #fffbeb; border: 1px solid #fef3c7; padding: 15px; border-radius: 8px; font-size: 12px; color: #92400e; line-height: 1.5;">
                                        <strong>Not you?</strong> ${escapeHtml(copy.warning)}
                                </div>
                        </div>

                        <div style="padding: 25px; text-align: center; color: #94a3b8; font-size: 11px; background: #fafafa; border-top: 1px solid #f1f5f9;">
                                Need immediate help? Contact <a href="mailto:${escapeHtml(supportEmail)}" style="color: ${primaryColor}; text-decoration: none; font-weight: bold;">${escapeHtml(supportEmail)}</a><br><br>
                                This is an automated email. Please do not reply to this address.<br>
                                <strong>© ${dayjs().year()} ${escapeHtml(env.COMPANY_NAME)}. All rights reserved.</strong>
                        </div>
                </div>
        </div>
</body>
</html>
        `;
  }

  function getAdminLevelTheme(level: AdminNotiLevel): {
    borderColor: string;
    textColor: string;
    chipBackground: string;
    chipTextColor: string;
  } {
    switch (level) {
      case AdminNotiLevel.Critical:
        return {
          borderColor: "#fecaca",
          textColor: "#7f1d1d",
          chipBackground: "#991b1b",
          chipTextColor: "#fee2e2",
        };
      case AdminNotiLevel.Warning:
        return {
          borderColor: "#fde68a",
          textColor: "#78350f",
          chipBackground: "#92400e",
          chipTextColor: "#fffbeb",
        };
      case AdminNotiLevel.Info:
        return {
          borderColor: "#bfdbfe",
          textColor: "#1e3a8a",
          chipBackground: "#1d4ed8",
          chipTextColor: "#eff6ff",
        };
    }
  }

  function renderMetadataRows(
    metadata: AdminNotiEmailPayload["metadata"],
  ): string {
    if (!metadata) {
      return "";
    }

    const rows = Object.entries(metadata)
      .filter(([, value]) => value !== null && value !== undefined)
      .map(
        ([key, value]) => `<tr>
    <td style="padding: 8px 10px; border: 1px solid #e2e8f0; font-weight: 600; color: #334155; width: 35%;">${escapeHtml(key)}</td>
    <td style="padding: 8px 10px; border: 1px solid #e2e8f0; color: #475569;">${escapeHtml(String(value))}</td>
</tr>`,
      );

    if (!rows.length) {
      return "";
    }

    return `
<div style="margin-top: 18px;">
    <div style="margin-bottom: 8px; font-size: 12px; letter-spacing: 0.8px; color: #64748b; font-weight: 700;">CONTEXT</div>
    <table style="width: 100%; border-collapse: collapse; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
        ${rows.join("\n")}
    </table>
</div>
        `;
  }

  function renderAdminNotiEmail(payload: AdminNotiEmailPayload): string {
    const copy = getAdminNotiCopy(payload.eventType);
    const level = copy.level;
    const theme = getAdminLevelTheme(level);
    const title = payload.titleOverride ?? copy.title;
    const message = payload.messageOverride ?? copy.message;
    const subject = payload.subjectOverride ?? copy.subject;

    const actionBlock =
      payload.actionLabel && payload.actionUrl
        ? `<div style="margin-top: 22px;"><a href="${escapeHtml(payload.actionUrl)}" style="display: inline-block; background: ${primaryColor}; color: #ffffff; text-decoration: none; padding: 10px 16px; border-radius: 8px; font-size: 13px; font-weight: 700;">${escapeHtml(payload.actionLabel)}</a></div>`
        : "";

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f7fa;font-family:Helvetica,Arial,sans-serif;">
    <div style="padding:30px 16px;">
        <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
            <div style="padding:18px 22px;background:#0f172a;color:#f8fafc;">
                <div style="font-size:13px;letter-spacing:1px;font-weight:700;">${escapeHtml(env.COMPANY_NAME)} ADMIN NOTIFICATION</div>
            </div>
            <div style="padding:22px;">
                <div style="display:inline-block;padding:4px 8px;border-radius:999px;background:${theme.chipBackground};color:${theme.chipTextColor};font-size:11px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;">${escapeHtml(level)}</div>
                <h2 style="margin:14px 0 10px;color:#0f172a;font-size:22px;line-height:1.3;">${escapeHtml(title)}</h2>
                <div style="border-left:4px solid ${theme.borderColor};padding:10px 12px;background:#f8fafc;color:${theme.textColor};font-size:14px;line-height:1.6;">${escapeHtml(message).replaceAll("\n", "<br>")}</div>
                ${renderMetadataRows(payload.metadata)}
                ${actionBlock}
            </div>
            <div style="padding:16px 22px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:11px;line-height:1.6;">
                Sent at ${escapeHtml(dayjs().format("YYYY-MM-DD HH:mm:ss"))}. This is an automated notification.
            </div>
        </div>
    </div>
</body>
</html>
        `;
  }

  async function sendOTPEmail(payload: EmailOtpPayload): Promise<void> {
    const copy = getOtpPurposeCopy(payload.purpose);

    try {
      const info = await transporter.sendMail({
        from: fromEmail,
        to: payload.to,
        subject: `${copy.subject} - OTP code`,
        html: renderEmail(payload),
      });

      const rejected = getRejectedRecipients(info);
      if (rejected.length > 0) {
        logger.error("OTP email rejected for some recipients", {
          to: rejected.map(maskEmail),
          purpose: String(payload.purpose),
        });
        throw new Error("Failed to send OTP email");
      }

      logger.info("OTP email sent successfully", {
        to: maskEmail(payload.to),
        purpose: String(payload.purpose),
      });
    } catch (error) {
      logger.error("Failed to send OTP email", {
        to: maskEmail(payload.to),
        purpose: String(payload.purpose),
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error("Failed to send OTP email");
    }
  }

  async function sendAdminNotiEmail(
    payload: AdminNotiEmailPayload,
  ): Promise<void> {
    const copy = getAdminNotiCopy(payload.eventType);
    const subject = payload.subjectOverride ?? copy.subject;

    try {
      const info = await transporter.sendMail({
        from: fromEmail,
        to: payload.to,
        subject,
        html: renderAdminNotiEmail(payload),
      });

      const rejected = getRejectedRecipients(info);
      if (rejected.length > 0) {
        logger.error("Admin notification email rejected for some recipients", {
          to: rejected.map(maskEmail),
          eventType: payload.eventType,
          subject,
          level: copy.level,
        });
        throw new Error("Failed to send admin notification email");
      }

      logger.info("Admin notification email sent successfully", {
        to: maskEmail(payload.to),
        eventType: payload.eventType,
        subject,
        level: copy.level,
      });
    } catch (error) {
      logger.error("Failed to send admin notification email", {
        to: maskEmail(payload.to),
        eventType: payload.eventType,
        subject,
        level: copy.level,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error("Failed to send admin notification email");
    }
  }

  return {
    getOtpPurposeCopy,
    getAdminNotiCopy,
    renderEmail,
    renderAdminNotiEmail,
    sendOTPEmail,
    sendAdminNotiEmail,
  };
}

export type EmailService = ReturnType<typeof createEmailService>;
