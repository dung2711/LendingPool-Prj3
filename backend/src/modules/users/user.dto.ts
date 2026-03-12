import { z } from "zod";

export const ZUserAddressReq = z.object({
  userAddress: z.string().describe("The Ethereum address of the user"),
});

export type IUserAddressReq = z.infer<typeof ZUserAddressReq>;

export const ZGetUserDetailRes = z.object({
  id: z.string().describe("The unique identifier of the user"),
  userAddress: z.string().describe("The Ethereum address of the user"),
  joinedAt: z
    .string()
    .describe("Timestamp when the user first joined the protocol"),
});

export type IGetUserDetailRes = z.infer<typeof ZGetUserDetailRes>;

export const ZUserAssetItem = z.object({
  assetId: z.string().describe("The unique identifier of the asset"),
  assetAddress: z
    .string()
    .describe("The Ethereum address of the asset contract"),
  symbol: z.string().describe("The symbol of the asset"),
  name: z.string().describe("The name of the asset"),
  decimals: z.number().describe("The number of decimals used by the asset"),
  depositedAmount: z
    .string()
    .describe("The amount this user has deposited of this asset"),
  borrowedAmount: z
    .string()
    .describe("The amount this user has borrowed of this asset"),
});

export type IUserAssetItem = z.infer<typeof ZUserAssetItem>;

export const ZGetDashboardDetailRes = z.object({
  user: ZGetUserDetailRes,
  assets: z
    .array(ZUserAssetItem)
    .describe("Assets the user has interacted with"),
});

export type IGetDashboardDetailRes = z.infer<typeof ZGetDashboardDetailRes>;
