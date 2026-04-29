import {
  type NextFunction,
  type Request,
  type Response,
  Router,
} from "express";
import { ZodError } from "zod";
import { ZAccrueLogReq, ZTreasuryLogReq } from "./log.dto";
import type { LogQueryService } from "./services/log-query.service";

export function createLogController(deps: {
  logQueryService: LogQueryService;
}) {
  const { logQueryService } = deps;
  const router = Router();

  router.get(
    "/accrue",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = ZAccrueLogReq.safeParse(req.query);
        if (!parsed.success) throw new ZodError(parsed.error.issues);

        const result = await logQueryService.listAccrueLogs(parsed.data);
        res.status(200).json({ success: true, logs: result });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/treasury",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = ZTreasuryLogReq.safeParse(req.query);
        if (!parsed.success) throw new ZodError(parsed.error.issues);

        const result = await logQueryService.listTreasuryLogs(parsed.data);
        res.status(200).json({ success: true, logs: result });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
