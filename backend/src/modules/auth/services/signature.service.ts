import type { Logger } from "@logtape/logtape";
import { ethers } from "ethers";
import type Redis from "ioredis";
import type { BaseEnv } from "src/shared/config";
import { AppErr, ErrCode } from "src/shared/constants";
import type { DatabaseClient } from "src/shared/infra";
import type { ChainId } from "src/shared/types";
import { type IdUtils, validateAddress } from "src/shared/utils";
import type { RateLimitService } from "src/shared/utils/rate-limit.service";
import type {
  IAuthSessionRes,
  ISendNonceReq,
  ISendNonceRes,
  IVerifyMessageReq,
} from "../auth.dto";
import type { ISessionService } from "./session.service";

function getNonceRedisKey(params: { userAddress: string; chainId: string }) {
  const { userAddress, chainId } = params;
  return `auth:nonce:${chainId}:${userAddress}`;
}

export function buildAuthMessage(params: {
  userAddress: string;
  chainId: string;
  nonce: string;
}) {
  const { userAddress, chainId, nonce } = params;

  return [
    "Welcome to Lending Pool.",
    "",
    "Sign this message to authenticate your wallet.",
    `Address: ${userAddress}`,
    `Chain ID: ${chainId}`,
    `Nonce: ${nonce}`,
  ].join("\n");
}

export function createSignatureService(deps: {
  redis: Redis;
  dbClient: DatabaseClient;
  sessionService: ISessionService;
  idUtil: IdUtils;
  logger: Logger;
  rateLimit: RateLimitService;
  env: Pick<BaseEnv, "AUTH_NONCE_TTL_SECONDS">;
}) {
  const { redis, dbClient, sessionService, idUtil, logger, rateLimit, env } =
    deps;
  const NONCE_RATE_LIMIT_SECONDS = 30;

  async function sendNonce(data: ISendNonceReq): Promise<ISendNonceRes> {
    const { userAddress, chainId } = data;
    const checksumAddress = validateAddress(userAddress);

    await rateLimit.ensureCooldown({
      key: `nonce:${chainId}:${checksumAddress}`,
      cooldownSeconds: NONCE_RATE_LIMIT_SECONDS,
      message: "Too many nonce requests. Please wait before requesting again.",
    });

    const nonce = idUtil.generateId();
    const redisKey = getNonceRedisKey({
      userAddress: checksumAddress,
      chainId,
    });
    const message = buildAuthMessage({
      userAddress: checksumAddress,
      chainId,
      nonce,
    });

    await redis.set(redisKey, nonce, "EX", env.AUTH_NONCE_TTL_SECONDS);

    logger.info("Issued auth nonce for {userAddress} on chain {chainId}", {
      userAddress: checksumAddress,
      chainId,
    });

    return {
      success: true,
      message,
      expiresIn: env.AUTH_NONCE_TTL_SECONDS,
    };
  }

  async function verifyMessage(
    data: IVerifyMessageReq,
    meta: {
      clientIp: string;
      userAgent: string;
    },
  ): Promise<IAuthSessionRes> {
    const { userAddress, chainId, signature } = data;
    const { clientIp, userAgent } = meta;
    const checksumAddress = validateAddress(userAddress);
    const redisKey = getNonceRedisKey({
      userAddress: checksumAddress,
      chainId,
    });
    const nonce = await redis.get(redisKey);

    if (!nonce) {
      throw new AppErr(ErrCode.Unauthorized, {
        errors: "Nonce not found or expired",
      });
    }
    const expectedMessage = buildAuthMessage({
      userAddress: checksumAddress,
      chainId,
      nonce,
    });
    const recoveredAddress = ethers.getAddress(
      ethers.verifyMessage(expectedMessage, signature),
    );

    if (recoveredAddress !== checksumAddress) {
      throw new AppErr(ErrCode.Unauthorized, {
        errors: "Signature does not match wallet address",
      });
    }

    const [user] = await dbClient.user.findOrCreate({
      where: {
        userAddress: checksumAddress,
        chainId,
      },
      defaults: {
        id: idUtil.snowflakeId(),
        userAddress: checksumAddress,
        chainId: chainId as unknown as ChainId,
        joinedAt: new Date(),
        createdAt: new Date(),
      },
    });

    const auth = await sessionService.createSessionWithMeta({
      user,
      clientIp,
      userAgent,
    });

    await redis.del(redisKey);

    logger.info(
      "Verified wallet signature for {userAddress} and create session {sessionId}",
      {
        userAddress: checksumAddress,
        sessionId: auth.sessionId,
      },
    );

    return auth;
  }

  return {
    sendNonce,
    verifyMessage,
  };
}

export type ISignatureService = ReturnType<typeof createSignatureService>;
