import {
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
  Router,
} from "express";
import type { AuthenticatedRequest } from "src/modules/auth";
import { requireAuthContext } from "src/modules/auth";
import { ZodError } from "zod";
import { zRegisterEmailReq, zSendOtpReq, zVerifyOtpReq } from "./email.dto";
import type { OTPService } from "./services";
import type { EmailRegistrationService } from "./services/email-registration.service";

export function createEmailController(deps: {
  emailRegistrationService: EmailRegistrationService;
  otpService: OTPService;
  authMiddleware: RequestHandler;
}) {
  const { emailRegistrationService, otpService, authMiddleware } = deps;

  const router = Router();

  router.post(
    "/send-otp",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = zSendOtpReq.safeParse({
          ...req.body,
        });

        if (!parsed.success) throw new ZodError(parsed.error.issues);

        const result = await otpService.sendOTP(parsed.data);

        res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    "/verify-otp",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = zVerifyOtpReq.safeParse({
          ...req.body,
        });

        if (!parsed.success) throw new ZodError(parsed.error.issues);

        const result = await otpService.verifyOtp(parsed.data);

        res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    "/register",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        requireAuthContext(req);

        const parsed = zRegisterEmailReq.safeParse({
          ...req.body,
        });

        if (!parsed.success) throw new ZodError(parsed.error.issues);

        const result = await emailRegistrationService.registerEmail(
          req.currentUser,
          parsed.data,
        );

        res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
