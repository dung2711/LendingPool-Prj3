import type { Logger } from "@logtape/logtape";
import { col } from "sequelize";
import { AppErr, ErrCode } from "src/shared/constants";
import type { DatabaseClient } from "src/shared/infra/";
import type { IReqUser } from "src/shared/types";
import { validateAddress } from "src/shared/utils";
import type {
  IGetDashboardDetailRes,
  IGetUserDetailRes,
  IGetUserEmailRes,
} from "./user.dto";

export function createUserService(deps: {
  dbClient: DatabaseClient;
  logger: Logger;
}) {
  const { dbClient, logger } = deps;

  async function getUserDetail(
    currentUser: IReqUser,
  ): Promise<IGetUserDetailRes> {
    const { userId, chainId } = currentUser;
    const userAddress = validateAddress(currentUser.userAddress);

    const user = await dbClient.user.findOne({
      where: { id: userId, userAddress, chainId },
    });
    if (!user) {
      throw new AppErr(ErrCode.UserNotFound);
    }

    logger.info("Fetched user detail: {userAddress}", { userAddress });
    return {
      id: user.id.toString(),
      userAddress: user.userAddress,
      chainId: user.chainId.toString(),
      joinedAt: user.joinedAt.toDateString(),
    };
  }

  async function getDashboardDetail(
    currentUser: IReqUser,
  ): Promise<IGetDashboardDetailRes> {
    const { userId, chainId } = currentUser;
    const userAddress = validateAddress(currentUser.userAddress);

    const user = await dbClient.user.findOne({
      where: { id: userId, userAddress, chainId },
    });
    if (!user) {
      throw new AppErr(ErrCode.UserNotFound);
    }

    // Join UserAsset → Asset to get asset details alongside user balances
    const userAssets = await dbClient.userAsset.findAll({
      where: { userId: user.id },
      attributes: [
        "depositedAmount",
        "borrowedAmount",
        [col("Asset.id"), "assetId"],
        [col("Asset.assetAddress"), "assetAddress"],
        [col("Asset.symbol"), "symbol"],
        [col("Asset.name"), "name"],
        [col("Asset.decimals"), "decimals"],
      ],
      include: [
        {
          model: dbClient.asset,
          attributes: [],
          required: true,
        },
      ],
    });

    const assets = userAssets.map((row) => {
      const d = row.dataValues as Record<string, unknown>;
      return {
        assetId: d.assetId as string,
        assetAddress: d.assetAddress as string,
        symbol: d.symbol as string,
        name: d.name as string,
        decimals: d.decimals as number,
        depositedAmount: row.depositedAmount,
        borrowedAmount: row.borrowedAmount,
      };
    });

    logger.info("Fetched dashboard for {userAddress}: {count} asset(s)", {
      userAddress,
      count: assets.length,
    });

    return {
      user: {
        id: user.id.toString(),
        userAddress: user.userAddress,
        chainId: user.chainId.toString(),
        joinedAt: user.joinedAt.toDateString(),
      },
      assets,
    };
  }

  async function getUserEmail(
    currentUser: IReqUser,
  ): Promise<IGetUserEmailRes> {
    const { userId, chainId } = currentUser;
    const checksumAddress = validateAddress(currentUser.userAddress);

    const user = await dbClient.user.findOne({
      where: { id: userId, userAddress: checksumAddress, chainId },
      attributes: ["email"],
    });

    if (!user) {
      logger.info(
        "Email lookup: No user found for {userAddress} on chain {chainId}",
        {
          userAddress: checksumAddress,
          chainId,
        },
      );
    }

    return {
      success: true,
      email: user?.email ?? null,
      found: Boolean(user),
    };
  }

  return {
    getUserDetail,
    getDashboardDetail,
    getUserEmail,
  };
}

export type IUserService = ReturnType<typeof createUserService>;
