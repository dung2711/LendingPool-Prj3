import { zChainId } from "src/shared/types";
import { z } from "zod";

export const ZSendNonceReq = z.object({
  userAddress: z.string().trim().describe("The wallet address to authenticate"),
  chainId: zChainId.describe("Blockchain ID"),
});

export type ISendNonceReq = z.infer<typeof ZSendNonceReq>;

export const ZSendNonceRes = z.object({
  success: z.literal(true),
  message: z.string().describe("The auth message that the user needs to sign"),
  expiresIn: z.number().int().positive(),
});

export type ISendNonceRes = z.infer<typeof ZSendNonceRes>;

export const ZVerifyMessageReq = z.object({
  userAddress: z.string().trim().describe("The wallet address to authenticate"),
  chainId: zChainId.describe("Blockchain ID"),
  signature: z.string().min(1).describe("The signed auth message"),
});

export type IVerifyMessageReq = z.infer<typeof ZVerifyMessageReq>;

export const ZRefreshTokenReq = z.object({
  refreshToken: z.string().describe("Current refresh token"),
});

export type IRefreshTokenReq = z.infer<typeof ZRefreshTokenReq>;

export const ZRevokeSessionReq = z
  .object({})
  .describe(
    "No body is required. The session is derived from the Bearer token.",
  );

export type IRevokeSessionReq = z.infer<typeof ZRevokeSessionReq>;

export const ZAuthUser = z.object({
  id: z.string(),
  userAddress: z.string(),
  chainId: zChainId,
});

export type IAuthUser = z.infer<typeof ZAuthUser>;

export const ZAuthSessionRes = z.object({
  user: ZAuthUser,
  sessionId: z
    .string()
    .describe("The session ID associated with the issued tokens"),
  accessToken: z.string().describe("The issued JWT access token"),
  refreshToken: z.string().describe("The refresh token"),
});

export type IAuthSessionRes = z.infer<typeof ZAuthSessionRes>;

export const ZRefreshTokenRes = z.object({
  accessToken: z.string().describe("The new JWT access token"),
  refreshToken: z.string().describe("The rotated refresh token"),
});

export type IRefreshTokenRes = z.infer<typeof ZRefreshTokenRes>;

export const ZRevokeSessionRes = z.object({
  success: z.literal(true),
});

export type IRevokeSessionRes = z.infer<typeof ZRevokeSessionRes>;
