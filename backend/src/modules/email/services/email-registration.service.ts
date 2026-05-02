import type { Logger } from "@logtape/logtape";
import { AppErr, ErrCode, OTPPurpose } from "src/shared/constants";
import type { DatabaseClient } from "src/shared/infra";
import type { IReqUser } from "src/shared/types";
import { maskEmail, validateAddress } from "src/shared/utils";
import type { IRegisterEmailReq } from "../email.dto";
import type { TokenCacheService } from "./token-cache.service";

export function createEmailRegistrationService(deps: {
  tokenCache: TokenCacheService;
  dbClient: DatabaseClient;
  logger: Logger;
}) {
  const { tokenCache, dbClient, logger } = deps;

  async function registerEmail(
    currentUser: IReqUser,
    params: IRegisterEmailReq,
  ) {
    const { registerToken } = params;
    const checksumAddress = validateAddress(currentUser.userAddress);
    const chainId = currentUser.chainId;

    const { email } = await tokenCache.verifyToken(
      registerToken,
      OTPPurpose.ADMIN_NOTI_SUBSCRIPTION,
    );

    const user = await dbClient.user.findOne({
      where: {
        id: currentUser.userId,
        userAddress: checksumAddress,
        chainId,
      },
      attributes: ["email"],
    });

    if (!user) {
      logger.warn(
        "Email registration failed: No user found for {address} (checksum {checksumAddress}) on chain {chainId}",
        {
          address: currentUser.userAddress,
          checksumAddress,
          chainId,
        },
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
          id: currentUser.userId,
          userAddress: checksumAddress,
          chainId,
        },
      },
    );

    logger.info(
      `Registered email {email} for user {address} on chain {chainId}`,
      {
        email: maskEmail(email),
        address: checksumAddress,
        chainId,
      },
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
