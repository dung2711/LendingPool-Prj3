import {
  type NextFunction,
  type Request,
  type Response,
  Router,
} from "express";
import { ZodError } from "zod";
import { ZGetTransactionsDetailsReq } from "./transaction.dto";
import type { ITransactionService } from "./transaction.service";

export function createTransactionController(deps: {
  transactionService: ITransactionService;
}) {
  const { transactionService } = deps;
  const router = Router();

  /**
   * GET /transactions?userAddress=&cursorTS=&cursorID=&type=&limit=
   */
  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = ZGetTransactionsDetailsReq.safeParse(req.query);

      if (!parsed.success) throw new ZodError(parsed.error.issues);

      const result = await transactionService.getTransactionsDetails(
        parsed.data,
      );

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (err) {
      // Pass to error handler middleware in index.ts
      next(err);
    }
  });

  return router;
}
