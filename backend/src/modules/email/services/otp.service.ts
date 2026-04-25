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
import type { ISendOtpReq, IVerifyOtpReq } from "../otp.dto";
import type { TokenCacheService } from "./token-cache.service";

export function createOTPService(deps: {
  notiPublisher: NotiPublisherService;
  logger: Logger;
  redis: Redis;
  tokenCache: TokenCacheService;
}) {
  const { notiPublisher, logger, redis, tokenCache } = deps;
  const OTP_TTL_SECONDS = 5 * 60; // 5 minutes
  function generateOTPCode() {
    // Generate a 6-digit OTP code (000000-999999)
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  function getOTPKey(params: ISendOtpReq) {
    return `otp:${params.purpose}:${params.email}`;
  }

  async function generateOTP(params: ISendOtpReq) {
    const otp = generateOTPCode();
    const otpKey = getOTPKey(params);

    const otpData: IOTPCache = {
      otp,
      email: params.email,
      purpose: params.purpose,
      createdAt: Date.now(),
    };

    // Store OTP in Redis with TTL
    await redis.set(otpKey, JSON.stringify(otpData), "EX", OTP_TTL_SECONDS);

    return otp;
  }

  async function checkOTP(email: string, otp: string, purpose: OTPPurpose) {
    const otpKey = getOTPKey({ email, purpose });
    const otpData = await redis.get(otpKey);

    if (!otpData) {
      throw new AppErr(ErrCode.InvalidOTP, {
        errors: "OTP not found or expired",
      });
    }

    const parsedOtpData: IOTPCache = JSON.parse(otpData);

    if (parsedOtpData.otp !== otp) {
      throw new AppErr(ErrCode.InvalidOTP, {
        errors: "OTP does not match",
      });
    }
  }

  async function sendOTP(params: ISendOtpReq) {
    const otp = await generateOTP(params);

    await notiPublisher.publishEmailEvent({
      type: EmailPurpose.OTP,
      payload: {
        to: params.email,
        otp,
        purpose: params.purpose,
        expiresInMinutes: OTP_TTL_SECONDS / 60,
        requestedAt: new Date().toISOString(),
      },
    });

    logger.info("OTP sent {email} {purpose}", {
      email: maskEmail(params.email),
      purpose: params.purpose,
    });

    return {
      success: true,
    };
  }

  async function verifyOtp(params: IVerifyOtpReq): Promise<{ token: string }> {
    await checkOTP(params.email, params.otp, params.purpose);
    const otpKey = getOTPKey({
      email: params.email,
      purpose: params.purpose,
    });
    await redis.del(otpKey);

    const token = await tokenCache.generateToken(params.purpose, params.email);

    logger.info("OTP verified and token generated {purpose} {email}", {
      email: maskEmail(params.email),
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
