import type { Logger } from "@logtape/logtape";
import type Redis from "ioredis";
import { AppErr, ErrCode, type OTPPurpose } from "src/shared/constants";
import type { ITokenCache } from "src/shared/types";
import { type IdUtils, maskEmail } from "src/shared/utils";

export function createTokenCacheService(deps: {
  redis: Redis;
  idUtil: IdUtils;
  logger: Logger;
}) {
  const { redis, idUtil, logger } = deps;
  const TOKEN_CACHE_TTL_SECONDS = 60 * 3; // 3 minutes

  async function generateToken(purpose: OTPPurpose, email: string) {
    const token = idUtil.generateId();
    const tokenData: ITokenCache = {
      purpose,
      email,
    };

    await redis.set(
      token,
      JSON.stringify(tokenData),
      "EX",
      TOKEN_CACHE_TTL_SECONDS,
    );
    logger.info(`Generated token for {purpose} and email {email}`, {
      purpose,
      email: maskEmail(email),
    });
    return token;
  }

  async function verifyToken(token: string, expectedPurpose: OTPPurpose) {
    const tokenDataStr = await redis.get(token);
    if (!tokenDataStr) {
      throw new AppErr(ErrCode.InvalidOtpToken, {
        errors: "OTP token not found or expired",
      });
    }

    const tokenData: ITokenCache = JSON.parse(tokenDataStr);
    if (tokenData.purpose !== expectedPurpose) {
      throw new AppErr(ErrCode.InvalidOtpToken, {
        errors: "OTP token purpose mismatch",
      });
    }

    await redis.del(token);
    return tokenData;
  }

  return {
    generateToken,
    verifyToken,
  };
}

export type TokenCacheService = ReturnType<typeof createTokenCacheService>;
