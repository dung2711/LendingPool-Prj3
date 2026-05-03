import type { RequestHandler } from "express";
import {
  type NextFunction,
  type Request,
  type Response,
  Router,
} from "express";
import { AppErr, ErrCode } from "src/shared/constants";
import { getClientIp, getUserAgent } from "src/shared/utils";
import { ZodError } from "zod";
import {
  ACCESS_TOKEN_COOKIE_NAME,
  type AuthCookieOptions,
  getCookieValue,
  REFRESH_TOKEN_COOKIE_NAME,
} from "./auth.cookie";
import { ZSendNonceReq, ZVerifyMessageReq } from "./auth.dto";
import {
  type AuthenticatedRequest,
  requireAuthContext,
} from "./auth.middleware";
import type { ISessionService, ISignatureService } from "./services";

function normalizeHeaderValue(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

export function createAuthController(deps: {
  signatureService: ISignatureService;
  sessionService: ISessionService;
  authMiddleware: RequestHandler;
  cookieOptions: AuthCookieOptions;
}) {
  const { signatureService, sessionService, authMiddleware, cookieOptions } =
    deps;
  const router = Router();

  router.post(
    "/nonce",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = ZSendNonceReq.safeParse(req.body);
        if (!parsed.success) throw new ZodError(parsed.error.issues);

        const result = await signatureService.sendNonce(parsed.data);
        res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    "/verify",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = ZVerifyMessageReq.safeParse(req.body);
        if (!parsed.success) throw new ZodError(parsed.error.issues);

        const clientIp = getClientIp({
          "x-forwarded-for": normalizeHeaderValue(
            req.headers["x-forwarded-for"],
          ),
          "x-real-ip": normalizeHeaderValue(req.headers["x-real-ip"]),
        });
        const userAgent = getUserAgent({
          "user-agent": normalizeHeaderValue(req.headers["user-agent"]),
        });

        const result = await signatureService.verifyMessage(parsed.data, {
          clientIp,
          userAgent,
        });

        res.cookie(
          ACCESS_TOKEN_COOKIE_NAME,
          result.accessToken,
          cookieOptions.accessToken,
        );
        res.cookie(
          REFRESH_TOKEN_COOKIE_NAME,
          result.refreshToken,
          cookieOptions.refreshToken,
        );
        res.status(200).json({
          success: true,
          sessionId: result.sessionId,
          user: result.user,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    "/refresh",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const refreshToken = getCookieValue(
          req.headers.cookie,
          REFRESH_TOKEN_COOKIE_NAME,
        );
        if (!refreshToken) {
          throw new AppErr(ErrCode.Unauthorized, {
            errors: "Missing refresh token cookie",
          });
        }

        const result = await sessionService.refreshToken({ refreshToken });
        res.cookie(
          ACCESS_TOKEN_COOKIE_NAME,
          result.accessToken,
          cookieOptions.accessToken,
        );
        res.cookie(
          REFRESH_TOKEN_COOKIE_NAME,
          result.refreshToken,
          cookieOptions.refreshToken,
        );
        res.status(200).json({ success: true });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    "/revoke",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        requireAuthContext(req);

        const result = await sessionService.revokeSession(req.currentUser);
        res.clearCookie(ACCESS_TOKEN_COOKIE_NAME, cookieOptions.clear);
        res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, cookieOptions.clear);
        res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
