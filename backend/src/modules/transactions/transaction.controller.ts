import {
  type NextFunction,
  type RequestHandler,
  type Response,
  Router,
} from "express";
import type { AuthenticatedRequest } from "src/modules/auth";
import { requireAuthContext } from "src/modules/auth";
import { ZodError } from "zod";
import { ZGetTransactionsDetailsReq } from "./transaction.dto";
import type { ITransactionService } from "./transaction.service";

export function createTransactionController(deps: {
  transactionService: ITransactionService;
  authMiddleware: RequestHandler;
}) {
  const { transactionService, authMiddleware } = deps;
  const router = Router();

  /**
   * GET /transactions?cursorTS=&cursorID=&type=&limit=
   */
  router.get(
    "/",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        requireAuthContext(req);
        const parsed = ZGetTransactionsDetailsReq.safeParse(req.query);

        if (!parsed.success) throw new ZodError(parsed.error.issues);

        const result = await transactionService.getTransactionsDetails(
          req.currentUser,
          parsed.data,
        );

        res.status(200).json({
          success: true,
          ...result,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
