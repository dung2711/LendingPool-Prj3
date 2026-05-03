import type { NextFunction, Request, Response } from "express";
import { AppErr, ErrCode } from "src/shared/constants";
import type { DatabaseClient } from "src/shared/infra";
import type { IReqUser } from "src/shared/types";
import { ACCESS_TOKEN_COOKIE_NAME, getCookieValue } from "./auth.cookie";
import type { ITokenService } from "./services";

export interface AuthenticatedRequest extends Request {
  currentUser?: IReqUser;
}

function getAccessTokenFromCookie(cookieHeader: string | undefined): string {
  const token = getCookieValue(cookieHeader, ACCESS_TOKEN_COOKIE_NAME);
  if (!token) {
    throw new AppErr(ErrCode.Unauthorized, {
      errors: "Missing access token cookie",
    });
  }

  return token;
}

export function requireAuthContext(
  req: AuthenticatedRequest,
): asserts req is AuthenticatedRequest & { currentUser: IReqUser } {
  if (!req.currentUser) {
    throw new AppErr(ErrCode.Unauthorized, {
      errors: "Missing authenticated request context",
    });
  }
}

export function createAuthMiddleware(deps: {
  tokenService: ITokenService;
  dbClient: DatabaseClient;
}) {
  const { tokenService, dbClient } = deps;

  return async (
    req: AuthenticatedRequest,
    _res: Response,
    next: NextFunction,
  ) => {
    try {
      const token = getAccessTokenFromCookie(req.headers.cookie);
      const auth = await tokenService.verifyAccessToken(token);

      const session = await dbClient.session.findOne({
        where: {
          id: auth.sessionId,
          createdById: auth.userId,
        },
      });

      if (!session) {
        throw new AppErr(ErrCode.SessionNotFound, {
          errors: "Session not found for access token",
        });
      }

      if (session.revoked) {
        throw new AppErr(ErrCode.SessionRevoked, {
          errors: "Session has been revoked",
        });
      }

      if (session.expired.getTime() <= Date.now()) {
        throw new AppErr(ErrCode.SessionExpired, {
          errors: "Session has expired",
        });
      }

      req.currentUser = auth;
      next();
    } catch (error) {
      next(error);
    }
  };
}
