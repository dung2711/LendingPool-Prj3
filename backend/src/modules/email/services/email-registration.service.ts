import type { Logger } from "@logtape/logtape";
import { ethers } from "ethers";
import { AppErr, ErrCode, OTPPurpose } from "src/shared/constants";
import type { DatabaseClient } from "src/shared/infra";
import { maskEmail, validateAddress } from "src/shared/utils";
import type { IRegisterEmailReq } from "../email.dto";
import type { TokenCacheService } from "./token-cache.service";

export function createEmailRegistrationService(deps: {
  tokenCache: TokenCacheService;
  dbClient: DatabaseClient;
  logger: Logger;
}) {
  const { tokenCache, dbClient, logger } = deps;

  async function registerEmail(params: IRegisterEmailReq) {
    const { registerToken, address, chainId } = params;
    validateAddress(address);
    const checksumAddress = ethers.getAddress(address);

    const { email } = await tokenCache.verifyToken(
      registerToken,
      OTPPurpose.ADMIN_NOTI_SUBSCRIPTION,
    );

    const user = await dbClient.user.findOne({
      where: {
        userAddress: checksumAddress,
        chainId,
      },
      attributes: ["email"],
    });

    if (!user) {
      logger.warn(
        "Email registration failed: No user found for {address} (checksum {checksumAddress}) on chain {chainId}",
        { address, checksumAddress, chainId },
      );
      throw new AppErr(ErrCode.UserNotFound);
    }

    if (user.email) {
      throw new AppErr(ErrCode.EmailAlreadyRegistered);
    }

    await dbClient.user.update(
      {
        email,
      },
      {
        where: {
          userAddress: checksumAddress,
          chainId,
        },
      },
    );

    logger.info(
      `Registered email {email} for user {address} on chain {chainId}`,
      { email: maskEmail(email), address: checksumAddress, chainId },
    );

    return {
      success: true,
    };
  }

  return {
    registerEmail,
  };
}

export type EmailRegistrationService = ReturnType<
  typeof createEmailRegistrationService
>;
