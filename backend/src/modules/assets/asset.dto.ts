import { z } from "zod";

export const ZGetAssetDetailBody = z.object({
  id: z.string().describe("The unique identifier of the asset"),
  assetAddress: z
    .string()
    .describe("The address of the asset on the blockchain"),
  symbol: z.string().describe("The symbol of the asset"),
  name: z.string().describe("The name of the asset"),
  decimals: z.number().describe("The number of decimals used by the asset"),
  isSupported: z
    .boolean()
    .describe("Whether the asset is supported in the lending pool"),
  totalDeposited: z
    .string()
    .describe("The total amount of the asset deposited in the lending pool"),
  totalBorrowed: z
    .string()
    .describe("The total amount of the asset borrowed from the lending pool"),
});

export type IGetAssetDetailRes = z.infer<typeof ZGetAssetDetailBody>;

export type IGetAssetsListRes = z.infer<typeof ZGetAssetDetailBody>[];

export const ZGetAssetsListRes = z.array(ZGetAssetDetailBody);

export const ZGetAssetReq = z.object({
  assetAddress: z
    .string()
    .describe("The address of the asset on the blockchain"),
});

export type IGetAssetReq = z.infer<typeof ZGetAssetReq>;

export const ZGetAssetConfigRes = z.object({
  assetAddress: z
    .string()
    .describe("The address of the asset on the blockchain"),
  baseRate: z.string().describe("The base interest rate for the asset"),
  slope1: z
    .string()
    .describe(
      "The slope of the interest rate curve when utilization is below the optimal level",
    ),
  slope2: z
    .string()
    .describe(
      "The slope of the interest rate curve when utilization is above the optimal level",
    ),
  optimalUtilization: z
    .string()
    .describe("The optimal utilization rate for the asset"),
  reserveFactor: z
    .string()
    .describe("The percentage of interest that goes to reserves"),
  collateralFactor: z
    .string()
    .describe(
      "The percentage of the asset's value that can be used as collateral",
    ),
  closeFactor: z
    .string()
    .describe("The percentage of the asset's value that can be liquidated"),
  liquidationIncentive: z
    .string()
    .describe(
      "The bonus percentage that liquidators receive when they liquidate a position using this asset as collateral",
    ),
  liquidationThreshold: z
    .string()
    .describe(
      "The utilization rate at which positions using this asset as collateral become eligible for liquidation",
    ),
});

export type IGetAssetConfigRes = z.infer<typeof ZGetAssetConfigRes>;
