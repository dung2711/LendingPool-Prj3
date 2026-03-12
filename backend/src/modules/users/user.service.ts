import type { Logger } from "@logtape/logtape";
import { col } from "sequelize";
import { AppErr, ErrCode } from "src/shared/constants";
import type { DatabaseClient } from "src/shared/infra/";
import { validateAddress } from "src/shared/utils";
import type {
  IGetDashboardDetailRes,
  IGetUserDetailRes,
  IUserAddressReq,
} from "./user.dto";

export function createUserService(deps: {
  dbClient: DatabaseClient;
  logger: Logger;
}) {
  const { dbClient, logger } = deps;

  async function getUserDetail(
    data: IUserAddressReq,
  ): Promise<IGetUserDetailRes> {
    const { userAddress } = data;
    validateAddress(userAddress);

    const user = await dbClient.user.findOne({ where: { userAddress } });
    if (!user) {
      throw new AppErr(ErrCode.UserNotFound);
    }

    logger.info("Fetched user detail: {userAddress}", { userAddress });
    return {
      id: user.id,
      userAddress: user.userAddress,
      joinedAt: user.joinedAt.toDateString(),
    };
  }

  async function getDashboardDetail(
    data: IUserAddressReq,
  ): Promise<IGetDashboardDetailRes> {
    const { userAddress } = data;
    validateAddress(userAddress);

    const user = await dbClient.user.findOne({ where: { userAddress } });
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
        id: user.id,
        userAddress: user.userAddress,
        joinedAt: user.joinedAt.toDateString(),
      },
      assets,
    };
  }

  return {
    getUserDetail,
    getDashboardDetail,
  };
}

export type IUserService = ReturnType<typeof createUserService>;
