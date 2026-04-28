import { OTPPurpose } from "src/shared/constants";
import { zChainId, zEmail } from "src/shared/types";
import { z } from "zod";

export const zVerifyOtpReq = z.object({
  email: zEmail.describe(
    "User email address. Required when register or reset password",
  ),
  otp: z.string().length(6).regex(/^\d+$/).describe("6-digit numeric OTP"),
  purpose: z.enum(OTPPurpose).describe("Purpose of the OTP"),
});
export type IVerifyOtpReq = z.infer<typeof zVerifyOtpReq>;

export const zSendOtpReq = z.object({
  email: zEmail.describe(
    "User email address. Required when register or reset password",
  ),
  purpose: z.enum(OTPPurpose).describe("Purpose of the OTP"),
});
export type ISendOtpReq = z.infer<typeof zSendOtpReq>;

export const zRegisterEmailReq = z.object({
  registerToken: z
    .string()
    .describe("Token from OTP verification, used to complete registration"),
  address: z.string().describe("Blockchain address to link with the email"),
  chainId: zChainId.describe("Blockchain ID"),
});
export type IRegisterEmailReq = z.infer<typeof zRegisterEmailReq>;
