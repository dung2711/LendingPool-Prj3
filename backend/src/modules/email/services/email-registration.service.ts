import type { Logger } from "@logtape/logtape";
import { AppErr, ErrCode, OTPPurpose } from "src/shared/constants";
import type { DatabaseClient } from "src/shared/infra";
import { maskEmail } from "src/shared/utils";
import type { IRegisterEmailReq } from "../otp.dto";
import type { TokenCacheService } from "./token-cache.service";

export function createEmailRegistrationService(deps: {
  tokenCache: TokenCacheService;
  dbClient: DatabaseClient;
  logger: Logger;
}) {
  const { tokenCache, dbClient, logger } = deps;

  async function registerEmail(params: IRegisterEmailReq) {
    const { registerToken, address, chainId } = params;
    const { email } = await tokenCache.verifyToken(
      registerToken,
      OTPPurpose.ADMIN_NOTI_SUBSCRIPTION,
    );

    const user = await dbClient.user.findOne({
      where: {
        userAddress: address,
        chainId,
      },
      attributes: ["email"],
    });

    if (!user) {
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
          userAddress: address,
          chainId,
        },
      },
    );

    logger.info(
      `Registered email {email} for user {address} on chain {chainId}`,
      { email: maskEmail(email), address, chainId },
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
