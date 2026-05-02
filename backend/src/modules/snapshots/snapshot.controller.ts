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
import type { SnapshotQueryService } from "./services";
import { ZAssetSnapshotReq, ZUserSnapshotReq } from "./snapshot.dto";

export function createSnapshotController(deps: {
  snapshotQueryService: SnapshotQueryService;
  authMiddleware: RequestHandler;
}) {
  const { snapshotQueryService, authMiddleware } = deps;
  const router = Router();

  router.get(
    "/asset-snapshots",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = ZAssetSnapshotReq.safeParse(req.query);
        if (!parsed.success) throw new ZodError(parsed.error.issues);

        const result = await snapshotQueryService.getAssetSnapshots(
          parsed.data,
        );
        res.status(200).json({ success: true, snapshots: result });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/user-snapshots",
    authMiddleware,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        requireAuthContext(req);
        const parsed = ZUserSnapshotReq.safeParse(req.query);
        if (!parsed.success) throw new ZodError(parsed.error.issues);

        const result = await snapshotQueryService.getUserSnapshots(
          req.currentUser,
          parsed.data,
        );
        res.status(200).json({ success: true, snapshots: result });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
