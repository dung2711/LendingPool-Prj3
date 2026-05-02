import type { RequestHandler } from "express";
import {
  type NextFunction,
  type Request,
  type Response,
  Router,
} from "express";
import { getClientIp, getUserAgent } from "src/shared/utils";
import { ZodError } from "zod";
import { ZRefreshTokenReq, ZSendNonceReq, ZVerifyMessageReq } from "./auth.dto";
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
}) {
  const { signatureService, sessionService, authMiddleware } = deps;
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

        res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    "/refresh",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = ZRefreshTokenReq.safeParse(req.body);
        if (!parsed.success) throw new ZodError(parsed.error.issues);

        const result = await sessionService.refreshToken(parsed.data);
        res.status(200).json(result);
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
        res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
