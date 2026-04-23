import {
  type AdminEventType,
  type AdminNotiLevel,
  EmailPurpose,
  type OTPPurpose,
} from "../constants";

export type OtpPurposeCopy = {
  subject: string;
  heading: string;
  intro: string;
  detailLabel: string;
  detailValue: string;
  warning: string;
};

export type EmailOtpPayload = {
  to: string;
  otp: string;
  purpose: OTPPurpose;
  expiresInMinutes?: number;
  requestedAt?: Date | string;
};

export type AdminNotiTemplateCopy = {
  subject: string;
  title: string;
  message: string;
  level: AdminNotiLevel;
};

export type AdminNotiEmailPayload = {
  to: string;
  eventType: AdminEventType;
  metadata?: Record<string, string | number | boolean | null | undefined>;
  actionLabel?: string;
  actionUrl?: string;
  subjectOverride?: string;
  titleOverride?: string;
  messageOverride?: string;
};

export type EmailDetails = {
  [EmailPurpose.OTP]: EmailOtpPayload;
  [EmailPurpose.AdminNotification]: AdminNotiEmailPayload;
};

export type EmailPayload<T extends EmailPurpose> = {
  type: T;
  payload: EmailDetails[T];
};

export type EmailEvent = {
  [K in EmailPurpose]: EmailPayload<K>;
}[EmailPurpose];
