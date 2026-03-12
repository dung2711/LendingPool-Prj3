import type { Logger } from "@logtape/logtape";
import { AppErr, ErrCode } from "src/shared/constants";
import type { DatabaseClient } from "src/shared/infra/";
import { validateAddress } from "src/shared/utils";
import type {
  IGetAssetConfigRes,
  IGetAssetDetailRes,
  IGetAssetReq,
  IGetAssetsListRes,
} from "./asset.dto";

export function createAssetService(deps: {
  dbClient: DatabaseClient;
  logger: Logger;
}) {
  const { dbClient, logger } = deps;

  async function getAssetsList(): Promise<IGetAssetsListRes> {
    try {
      const assets = await dbClient.asset.findAll({
        where: {
          isSupported: true,
        },
      });
      const result = assets.map((asset) => ({
        id: asset.id,
        assetAddress: asset.assetAddress,
        symbol: asset.symbol,
        name: asset.name,
        decimals: asset.decimals,
        isSupported: asset.isSupported,
        totalDeposited: asset.totalDeposited,
        totalBorrowed: asset.totalBorrowed,
      }));
      logger.info("Fetched assets list successfully, count: {count}", {
        count: result.length,
      });
      return result;
    } catch (error) {
      logger.error("Error occurred while fetching assets list", { error });
      throw new AppErr(ErrCode.InternalError);
    }
  }

  async function getAssetDetails(
    data: IGetAssetReq,
  ): Promise<IGetAssetDetailRes> {
    const { assetAddress } = data;
    validateAddress(assetAddress);
    try {
      const asset = await dbClient.asset.findOne({
        where: {
          assetAddress,
        },
      });
      if (!asset) {
        throw new AppErr(ErrCode.AssetNotFound);
      }
      return {
        id: asset.id,
        assetAddress: asset.assetAddress,
        symbol: asset.symbol,
        name: asset.name,
        decimals: asset.decimals,
        isSupported: asset.isSupported,
        totalDeposited: asset.totalDeposited,
        totalBorrowed: asset.totalBorrowed,
      };
    } catch (error) {
      logger.error("Error occurred while fetching asset details", { error });
      if (error instanceof AppErr) {
        throw error;
      }
      throw new AppErr(ErrCode.InternalError);
    }
  }

  async function getAssetConfig(
    data: IGetAssetReq,
  ): Promise<IGetAssetConfigRes> {
    const { assetAddress } = data;
    validateAddress(assetAddress);
    try {
      const assetConfig = await dbClient.assetConfig.findOne({
        include: [
          {
            model: dbClient.asset,
            attributes: [],
            required: true,
          },
        ],
        where: {
          "$Asset.assetAddress$": assetAddress,
        },
      });
      if (!assetConfig) {
        throw new AppErr(ErrCode.AssetNotFound);
      }
      return {
        assetAddress,
        baseRate: assetConfig.baseRate,
        slope1: assetConfig.slope1,
        slope2: assetConfig.slope2,
        optimalUtilization: assetConfig.optimalUtilization,
        reserveFactor: assetConfig.reserveFactor,
        collateralFactor: assetConfig.collateralFactor,
        closeFactor: assetConfig.closeFactor,
        liquidationIncentive: assetConfig.liquidationIncentive,
        liquidationThreshold: assetConfig.liquidationThreshold,
      };
    } catch (error) {
      logger.error("Error occurred while fetching asset config", { error });
      if (error instanceof AppErr) {
        throw error;
      }
      throw new AppErr(ErrCode.InternalError);
    }
  }

  return {
    getAssetsList,
    getAssetDetails,
    getAssetConfig,
  };
}

export type IAssetService = ReturnType<typeof createAssetService>;
