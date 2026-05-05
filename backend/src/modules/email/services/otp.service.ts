import type { Logger } from "@logtape/logtape";
import type Redis from "ioredis";
import type { NotiPublisherService } from "src/modules/noti-worker";
import {
  AppErr,
  EmailPurpose,
  ErrCode,
  type OTPPurpose,
} from "src/shared/constants";
import type { IOTPCache } from "src/shared/types";
import { maskEmail } from "src/shared/utils/log-retraction";
import type { RateLimitService } from "src/shared/utils/rate-limit.service";
import type { ISendOtpReq, IVerifyOtpReq } from "../email.dto";
import type { TokenCacheService } from "./token-cache.service";

export function createOTPService(deps: {
  notiPublisher: NotiPublisherService;
  logger: Logger;
  redis: Redis;
  tokenCache: TokenCacheService;
  rateLimit: RateLimitService;
}) {
  const { notiPublisher, logger, redis, tokenCache, rateLimit } = deps;
  const OTP_TTL_SECONDS = 5 * 60; // 5 minutes
  const OTP_RESEND_COOLDOWN_SECONDS = 60; // 1 minute
  const MAX_OTP_ATTEMPTS = 5;

  function normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  function normalizeOtp(otp: string) {
    return otp.trim();
  }

  function generateOTPCode() {
    // Generate a 6-digit OTP code (000000-999999)
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  function getOTPKey(params: ISendOtpReq) {
    return `otp:${params.purpose}:${normalizeEmail(params.email)}`;
  }

  function buildAttemptKey(email: string, purpose: OTPPurpose, otp: string) {
    return `att:${email}:${purpose}:${otp}`;
  }

  async function generateOTP(params: ISendOtpReq) {
    const otp = generateOTPCode();
    const otpKey = getOTPKey(params);

    await rateLimit.ensureCooldown({
      key: otpKey,
      cooldownSeconds: OTP_RESEND_COOLDOWN_SECONDS,
      message: "Too many OTP requests. Please try again later.",
    });

    const otpData: IOTPCache = {
      otp,
      email: normalizeEmail(params.email),
      purpose: params.purpose,
      createdAt: Date.now(),
    };

    // Store OTP in Redis with TTL
    await redis.set(otpKey, JSON.stringify(otpData), "EX", OTP_TTL_SECONDS);

    return otp;
  }

  async function checkOTP(email: string, otp: string, purpose: OTPPurpose) {
    const normalizedEmail = normalizeEmail(email);
    const normalizedOtp = normalizeOtp(otp);
    const otpKey = getOTPKey({ email: normalizedEmail, purpose });

    await rateLimit.ensureAttemptLimit({
      key: buildAttemptKey(normalizedEmail, purpose, normalizedOtp),
      maxAttempts: MAX_OTP_ATTEMPTS,
      cooldownSeconds: OTP_TTL_SECONDS,
      message: "Too many OTP attempts. Please try again later.",
    });

    const otpData = await redis.get(otpKey);

    if (!otpData) {
      logger.warn("OTP verification failed: token missing or expired", {
        email: maskEmail(normalizedEmail),
        purpose,
      });
      throw new AppErr(ErrCode.InvalidOTP, {
        errors: "OTP not found or expired",
      });
    }

    const parsedOtpData: IOTPCache = JSON.parse(otpData);

    if (parsedOtpData.otp !== normalizedOtp) {
      logger.warn("OTP verification failed: code mismatch", {
        email: maskEmail(normalizedEmail),
        purpose,
      });
      throw new AppErr(ErrCode.InvalidOTP, {
        errors: "OTP does not match",
      });
    }

    await redis.del(
      buildAttemptKey(normalizedEmail, parsedOtpData.purpose, normalizedOtp),
    );
  }

  async function sendOTP(params: ISendOtpReq) {
    const normalizedEmail = normalizeEmail(params.email);
    const otp = await generateOTP({
      ...params,
      email: normalizedEmail,
    });

    await notiPublisher.publishEmailEvent({
      type: EmailPurpose.OTP,
      payload: {
        to: normalizedEmail,
        otp,
        purpose: params.purpose,
        expiresInMinutes: OTP_TTL_SECONDS / 60,
        requestedAt: new Date().toISOString(),
      },
    });

    logger.info("OTP sent {email} {purpose}", {
      email: maskEmail(normalizedEmail),
      purpose: params.purpose,
    });

    return {
      success: true,
    };
  }

  async function verifyOtp(params: IVerifyOtpReq): Promise<{ token: string }> {
    const normalizedEmail = normalizeEmail(params.email);
    const normalizedOtp = normalizeOtp(params.otp);

    await checkOTP(normalizedEmail, normalizedOtp, params.purpose);
    const otpKey = getOTPKey({
      email: normalizedEmail,
      purpose: params.purpose,
    });
    await redis.del(otpKey);

    const token = await tokenCache.generateToken(
      params.purpose,
      normalizedEmail,
    );

    logger.info("OTP verified and token generated {purpose} {email}", {
      email: maskEmail(normalizedEmail),
      purpose: params.purpose,
    });

    return { token };
  }

  return {
    sendOTP,
    verifyOtp,
  };
}

export type OTPService = ReturnType<typeof createOTPService>;
