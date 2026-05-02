import type { Logger } from "@logtape/logtape";
import dayjs from "dayjs";
import type { User } from "src/models";
import type { BaseEnv } from "src/shared/config";
import { AppErr, ErrCode } from "src/shared/constants";
import type { DatabaseClient } from "src/shared/infra";
import type { IReqUser } from "src/shared/types";
import type { IdUtils } from "src/shared/utils";
import type {
  IAuthSessionRes,
  IRefreshTokenReq,
  IRefreshTokenRes,
  IRevokeSessionRes,
} from "../auth.dto";
import type { ITokenService } from "./token.service";

function serializeUser(user: Pick<User, "id" | "userAddress" | "chainId">) {
  return {
    id: user.id.toString(),
    userAddress: user.userAddress,
    chainId: user.chainId.toString(),
  };
}

export function createSessionService(deps: {
  dbClient: DatabaseClient;
  tokenService: ITokenService;
  idUtil: IdUtils;
  logger: Logger;
  env: Pick<BaseEnv, "JWT_REFRESH_TOKEN_TTL_SECONDS">;
}) {
  const { dbClient, tokenService, idUtil, logger, env } = deps;

  function buildRefreshExpiry() {
    return dayjs().add(env.JWT_REFRESH_TOKEN_TTL_SECONDS, "seconds").toDate();
  }

  async function createSessionWithMeta(params: {
    user: Pick<User, "id" | "userAddress" | "chainId">;
    clientIp: string;
    userAgent: string;
  }): Promise<IAuthSessionRes> {
    const { user, clientIp, userAgent } = params;
    const sessionId = idUtil.generateId();
    const refreshToken = idUtil.generateId();
    const expiredAt = buildRefreshExpiry();

    const accessToken = await tokenService.generateAccessToken({
      userId: user.id.toString(),
      userAddress: user.userAddress,
      chainId: user.chainId.toString(),
      sessionId,
    });
    await dbClient.session.create({
      id: sessionId,
      device: userAgent,
      ip: clientIp,
      token: refreshToken,
      createdById: user.id,
      expired: expiredAt,
      revoked: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    logger.info("Created auth session {sessionId} for user {userId}", {
      sessionId,
      userId: user.id.toString(),
    });

    return {
      user: serializeUser(user),
      sessionId,
      accessToken,
      refreshToken,
    };
  }

  async function refreshToken(
    data: IRefreshTokenReq,
  ): Promise<IRefreshTokenRes> {
    const { refreshToken } = data;
    const session = await dbClient.session.findOne({
      where: { token: refreshToken },
    });

    if (!session) {
      throw new AppErr(ErrCode.SessionNotFound);
    }

    if (session.revoked) {
      throw new AppErr(ErrCode.SessionRevoked);
    }

    if (session.expired < new Date()) {
      throw new AppErr(ErrCode.SessionExpired);
    }

    const user = await dbClient.user.findOne({
      where: {
        id: session.createdById,
      },
    });

    if (!user) {
      throw new AppErr(ErrCode.SessionNotFound, {
        errors: "Session user no longer exists",
      });
    }

    const accessToken = await tokenService.generateAccessToken({
      userId: session.createdById.toString(),
      userAddress: user.userAddress,
      chainId: user.chainId.toString(),
      sessionId: session.id,
    });

    logger.info("Rotated access token for session {sessionId}", {
      sessionId: session.id,
    });

    return {
      accessToken,
      refreshToken: session.token,
    };
  }

  async function revokeSession(
    currentUser: IReqUser,
  ): Promise<IRevokeSessionRes> {
    const [rowsUpdated] = await dbClient.session.update(
      { revoked: true },
      {
        where: {
          id: currentUser.sessionId,
          createdById: currentUser.userId,
        },
      },
    );

    if (rowsUpdated === 0) {
      throw new AppErr(ErrCode.SessionNotFound);
    }

    logger.info("Revoked session {sessionId}", {
      sessionId: currentUser.sessionId,
    });

    return { success: true };
  }

  return {
    createSessionWithMeta,
    revokeSession,
    refreshToken,
  };
}

export type ISessionService = ReturnType<typeof createSessionService>;
