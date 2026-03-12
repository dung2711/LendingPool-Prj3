import { ethers } from "ethers";
import { AppErr, ErrCode } from "../constants";

export function validateAddress(userAddress: string) {
  if (!ethers.isAddress(userAddress) || userAddress === ethers.ZeroAddress) {
    throw new AppErr(ErrCode.BadRequest, {
      errors: "Invalid Ethereum address",
    });
  }
}
