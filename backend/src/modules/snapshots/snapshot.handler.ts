import type { Logger } from "@logtape/logtape";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import type { Contract } from "ethers";
import {
  type InferCreationAttributes,
  Op,
  type Sequelize,
  type Transaction,
} from "sequelize";
import type { AssetSnapshot } from "src/models/asset_snapshot.model";
import type { UserSnapshot } from "src/models/user_snapshot.model";
import type { CronerEnv } from "src/shared/config/env/croner";
import { CronnerType, ProtocolContract } from "src/shared/constants";
import type { DatabaseClient } from "src/shared/infra";
import type { ChainId } from "src/shared/types/blockchain";
import type { IdUtils } from "src/shared/utils";
import type { BlockchainConfig } from "../blockchain";

dayjs.extend(utc);

export function createSnapshotHandler(deps: {
  logger: Logger;
  dbClient: DatabaseClient;
  sequelize: Sequelize;
  blcConfig: BlockchainConfig;
  env: CronerEnv;
  idUtils: IdUtils;
}) {
  const { logger, dbClient, env, blcConfig, idUtils, sequelize } = deps;
  const SNAPSHOT_BATCH_SIZE = env.SNAPSHOT_BATCH_SIZE;

  async function takeAssetSnapshot(params: {
    lastSnappedId: bigint;
    chainId: ChainId;
    lendingPool: Contract;
    snapshotBlockNumber: number;
    tx: Transaction;
  }): Promise<{ hasMore: boolean; maxSnappedId: bigint }> {
    const { lastSnappedId, chainId, lendingPool, snapshotBlockNumber, tx } =
      params;
    const assets = await dbClient.asset.findAll({
      where: { id: { [Op.gt]: lastSnappedId }, chainId },
      attributes: [
        "id",
        "assetAddress",
        "totalDeposited",
        "totalBorrowed",
        "treasuryBalance",
      ],
      limit: SNAPSHOT_BATCH_SIZE,
      order: [["id", "ASC"]],
    });

    if (assets.length === 0) {
      logger.info(
        "No more assets to snapshot. Last snapped asset id: {lastSnappedId}",
        { lastSnappedId },
      );
      return { hasMore: false, maxSnappedId: lastSnappedId };
    }

    const datas: InferCreationAttributes<AssetSnapshot>[] = await Promise.all(
      assets.map(async (asset) => {
        const [utilizationRate, depositRate, borrowRate] =
          await lendingPool.getMarketRates(asset.assetAddress, {
            blockTag: snapshotBlockNumber,
          });
        return {
          id: idUtils.generateId(),
          assetId: asset.id,
          blockNumber: snapshotBlockNumber,
          totalDeposited: asset.totalDeposited,
          totalBorrowed: asset.totalBorrowed,
          treasuryBalance: asset.treasuryBalance,
          utilizationRate: utilizationRate.toString(),
          depositRate: depositRate.toString(),
          borrowRate: borrowRate.toString(),
          snapshotAt: dayjs().toDate(),
        };
      }),
    );

    await dbClient.assetSnapshot.bulkCreate(datas, { transaction: tx });

    return { hasMore: true, maxSnappedId: assets[assets.length - 1].id };
  }

  async function takeUserSnapshot(params: {
    lastSnappedId: bigint;
    chainId: ChainId;
    lendingPool: Contract;
    snapshotBlockNumber: number;
    tx: Transaction;
  }): Promise<{ hasMore: boolean; maxSnappedId: bigint }> {
    const { lastSnappedId, chainId, lendingPool, snapshotBlockNumber, tx } =
      params;
    const users = await dbClient.user.findAll({
      where: { id: { [Op.gt]: lastSnappedId }, chainId },
      attributes: ["id", "userAddress"],
      limit: SNAPSHOT_BATCH_SIZE,
      order: [["id", "ASC"]],
    });

    if (users.length === 0) {
      logger.info(
        "No more users to snapshot. Last snapped user id: {lastSnappedId}",
        { lastSnappedId },
      );
      return { hasMore: false, maxSnappedId: lastSnappedId };
    }

    const datas: InferCreationAttributes<UserSnapshot>[] = await Promise.all(
      users.map(async (user) => {
        const [totalDepositedUSD, totalBorrowedUSD, netWorthUSD, healthFactor] =
          await lendingPool.getAccountSnapshot(user.userAddress, {
            blockTag: snapshotBlockNumber,
          });
        return {
          id: idUtils.generateId(),
          userId: user.id,
          blockNumber: snapshotBlockNumber,
          totalDepositedUSD: totalDepositedUSD.toString(),
          totalBorrowedUSD: totalBorrowedUSD.toString(),
          netWorthUSD: netWorthUSD.toString(),
          healthFactor: healthFactor.toString(),
          snapshotAt: dayjs().toDate(),
        };
      }),
    );

    await dbClient.userSnapshot.bulkCreate(datas, { transaction: tx });

    return { hasMore: true, maxSnappedId: users[users.length - 1].id };
  }

  async function runBatchAssetSnapshot(params: {
    chainId: ChainId;
    snapshotBlockNumber: number;
  }): Promise<void> {
    const { chainId, snapshotBlockNumber } = params;
    const lendingPool = blcConfig.getProtocolContract(
      ProtocolContract.LendingPool,
      chainId,
    );

    const snapshotDate = dayjs.utc().startOf("day").format("YYYY-MM-DD");
    logger.info(
      "Starting asset snapshot for chainId: {chainId} at {snapshotDate}",
      { chainId, snapshotDate },
    );
    let hasMoreRecord = true;
    while (hasMoreRecord) {
      await sequelize.transaction(async (tx) => {
        const [lastSnapshot] = await dbClient.cronnerState.findOrCreate({
          where: { id: `asset-snapshot-${chainId}-${snapshotDate}` },
          defaults: {
            id: `asset-snapshot-${chainId}-${snapshotDate}`,
            type: CronnerType.AssetSnapshot,
            lastSnappedId: 0n,
          },
          attributes: ["lastSnappedId"],
          transaction: tx,
        });

        const { hasMore, maxSnappedId } = await takeAssetSnapshot({
          lastSnappedId: lastSnapshot.lastSnappedId,
          chainId,
          lendingPool,
          snapshotBlockNumber,
          tx,
        });

        await dbClient.cronnerState.update(
          { lastSnappedId: maxSnappedId },
          {
            where: { id: `asset-snapshot-${chainId}-${snapshotDate}` },
            transaction: tx,
          },
        );

        hasMoreRecord = hasMore;
      });
    }
  }

  async function runBatchUserSnapshot(params: {
    chainId: ChainId;
    snapshotBlockNumber: number;
  }): Promise<void> {
    const { chainId, snapshotBlockNumber } = params;
    const lendingPool = blcConfig.getProtocolContract(
      ProtocolContract.LendingPool,
      chainId,
    );

    const snapshotDate = dayjs.utc().startOf("day").format("YYYY-MM-DD");
    logger.info(
      "Starting user snapshot for chainId: {chainId} at {snapshotDate}",
      { chainId, snapshotDate },
    );
    let hasMoreRecord = true;
    while (hasMoreRecord) {
      await sequelize.transaction(async (tx) => {
        const [lastSnapshot] = await dbClient.cronnerState.findOrCreate({
          where: { id: `user-snapshot-${chainId}-${snapshotDate}` },
          defaults: {
            id: `user-snapshot-${chainId}-${snapshotDate}`,
            type: CronnerType.UserSnapshot,
            lastSnappedId: 0n,
          },
          attributes: ["lastSnappedId"],
          transaction: tx,
        });

        const { hasMore, maxSnappedId } = await takeUserSnapshot({
          lastSnappedId: lastSnapshot.lastSnappedId,
          chainId,
          lendingPool,
          snapshotBlockNumber,
          tx,
        });

        await dbClient.cronnerState.update(
          { lastSnappedId: maxSnappedId },
          {
            where: { id: `user-snapshot-${chainId}-${snapshotDate}` },
            transaction: tx,
          },
        );

        hasMoreRecord = hasMore;
      });
    }
  }

  return { runBatchAssetSnapshot, runBatchUserSnapshot };
}

export type SnapshotHandler = ReturnType<typeof createSnapshotHandler>;
