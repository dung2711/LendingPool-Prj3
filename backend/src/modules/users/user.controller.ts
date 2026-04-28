import {
  type NextFunction,
  type Request,
  type Response,
  Router,
} from "express";
import { ZodError } from "zod";
import { ZUserAddressReq, ZUserEmailLookupReq } from "./user.dto";
import type { IUserService } from "./user.service";

export function createUserController(deps: { userService: IUserService }) {
  const { userService } = deps;
  const router = Router();

  /**
   * GET /users/detail?userAddress=
   */
  router.get(
    "/detail",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = ZUserAddressReq.safeParse(req.query);
        if (!parsed.success) throw new ZodError(parsed.error.issues);

        const result = await userService.getUserDetail(parsed.data);
        res.status(200).json({ success: true, user: result });
      } catch (err) {
        next(err);
      }
    },
  );

  /**
   * GET /users/dashboard?userAddress=
   */
  router.get(
    "/dashboard",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = ZUserAddressReq.safeParse(req.query);
        if (!parsed.success) throw new ZodError(parsed.error.issues);

        const result = await userService.getDashboardDetail(parsed.data);
        res.status(200).json({ success: true, ...result });
      } catch (err) {
        next(err);
      }
    },
  );

  /**
   * GET /users/email?userAddress=&chainId=
   */
  router.get(
    "/email",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = ZUserEmailLookupReq.safeParse(req.query);
        if (!parsed.success) throw new ZodError(parsed.error.issues);

        const result = await userService.getUserEmail(parsed.data);
        res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
