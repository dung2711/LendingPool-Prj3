import {
  type NextFunction,
  type Request,
  type Response,
  Router,
} from "express";
import { ZodError } from "zod";
import { ZGetAssetReq, ZGetAssetsListReq } from "./asset.dto";
import type { IAssetService } from "./asset.service";

export function createAssetController(deps: { assetService: IAssetService }) {
  const { assetService } = deps;
  const router = Router();

  router.get(
    "/list",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = ZGetAssetsListReq.safeParse(req.query);
        if (!parsed.success) throw new ZodError(parsed.error.issues);

        const result = await assetService.getAssetsList(parsed.data);
        res.status(200).json({
          success: true,
          assets: result,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    "/detail",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = ZGetAssetReq.safeParse({
          ...req.query,
        });

        if (!parsed.success) throw new ZodError(parsed.error.issues);

        const result = await assetService.getAssetDetails({
          assetAddress: parsed.data.assetAddress,
        });

        res.status(200).json({
          success: true,
          asset: result,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    "/config",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = ZGetAssetReq.safeParse(req.query);

        if (!parsed.success) throw new ZodError(parsed.error.issues);

        const result = await assetService.getAssetConfig(parsed.data);

        res.status(200).json({
          success: true,
          assetConfig: result,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
