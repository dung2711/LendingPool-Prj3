import type { OTPPurpose } from "../constants";

export * from "./blockchain";
export * from "./dto";
export * from "./notification";

export interface IOTPCache {
  otp: string;
  email: string;
  purpose: OTPPurpose;
  createdAt: number;
}

export interface ITokenCache {
  purpose: OTPPurpose;
  email: string;
}
