import {
  type NextFunction,
  type RequestHandler,
  type Response,
  Router,
} from "express";
import type { AuthenticatedRequest } from "src/modules/auth";
import { requireAuthContext } from "src/modules/auth";
import type { IUserService } from "./user.service";

export function createUserController(deps: {
  userService: IUserService;
  authMiddleware: RequestHandler;
}) {
  const { userService, authMiddleware } = deps;
  const router = Router();

  /**
   * GET /users/detail
   */
  router.get(
    "/detail",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        requireAuthContext(req);
        const result = await userService.getUserDetail(req.currentUser);
        res.status(200).json({ success: true, user: result });
      } catch (err) {
        next(err);
      }
    },
  );

  /**
   * GET /users/dashboard
   */
  router.get(
    "/dashboard",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        requireAuthContext(req);
        const result = await userService.getDashboardDetail(req.currentUser);
        res.status(200).json({ success: true, ...result });
      } catch (err) {
        next(err);
      }
    },
  );

  /**
   * GET /users/email
   */
  router.get(
    "/email",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        requireAuthContext(req);
        const result = await userService.getUserEmail(req.currentUser);
        res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
