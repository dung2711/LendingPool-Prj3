import type { Logger } from "@logtape/logtape";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { Op } from "sequelize";
import type { DatabaseClient } from "src/shared/infra";
import type { IdUtils } from "src/shared/utils";

dayjs.extend(utc);

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const BPS_SCALE = 10000n;
const RATE_SCALE_16 = 10000000000000000n;
const SCALE_18 = 1000000000000000000n;
const MAX_UINT256 = (1n << 256n) - 1n;

function scaleByBps(value: bigint, bps: bigint): bigint {
  return (value * bps) / BPS_SCALE;
}

function normalizeTo18(value: bigint, decimals: number): bigint {
  if (decimals === 18) {
    return value;
  }

  if (decimals < 18) {
    return value * 10n ** BigInt(18 - decimals);
  }

  return value / 10n ** BigInt(decimals - 18);
}

export type SeedSnapshotsResult = {
  chainId: number;
  days: number;
  createdAssetSnapshots: number;
  createdUserSnapshots: number;
};

export function createSeedService(deps: {
  dbClient: DatabaseClient;
  logger: Logger;
  idUtil: IdUtils;
}) {
  const { dbClient, logger, idUtil } = deps;

  async function seedSnapshots(): Promise<SeedSnapshotsResult> {
    const chainId = 11155111;
    const days = 30;
    const blockNumberStart = 10000000;

    const [assets, users] = await Promise.all([
      dbClient.asset.findAll({
        where: { chainId, isSupported: true },
        attributes: [
          "id",
          "decimals",
          "totalDeposited",
          "totalBorrowed",
          "treasuryBalance",
        ],
      }),
      dbClient.user.findAll({
        where: { chainId },
        attributes: ["id"],
      }),
    ]);

    const assetIds = assets.map((asset) => asset.id);
    const userIds = users.map((user) => user.id);

    const startDate = dayjs
      .utc()
      .startOf("day")
      .subtract(days - 1, "day")
      .toDate();
    const endDate = dayjs.utc().endOf("day").toDate();

    await dbClient.$sequelize.transaction(async (tx) => {
      if (assetIds.length > 0) {
        await dbClient.assetSnapshot.destroy({
          where: {
            assetId: { [Op.in]: assetIds },
            createdAt: {
              [Op.gte]: startDate,
              [Op.lte]: endDate,
            },
          },
          transaction: tx,
        });
      }

      if (userIds.length > 0) {
        await dbClient.userSnapshot.destroy({
          where: {
            userId: { [Op.in]: userIds },
            createdAt: {
              [Op.gte]: startDate,
              [Op.lte]: endDate,
            },
          },
          transaction: tx,
        });
      }

      const assetSnapshotRows: Array<{
        id: string;
        assetId: bigint;
        blockNumber: number;
        totalDeposited: string;
        totalBorrowed: string;
        treasuryBalance: string;
        utilizationRate: string;
        depositRate: string;
        borrowRate: string;
        createdAt: Date;
      }> = [];

      for (let dayIndex = 0; dayIndex < days; dayIndex += 1) {
        const createdAt = new Date(
          startDate.getTime() + dayIndex * ONE_DAY_MS + 12 * 60 * 60 * 1000,
        );
        const blockNumber = blockNumberStart + dayIndex;

        for (const asset of assets) {
          const assetIdBigInt = BigInt(asset.id);
          const trendBps =
            BPS_SCALE + BigInt(dayIndex * 18) + (assetIdBigInt % 17n);
          const borrowedBps =
            BPS_SCALE + BigInt(dayIndex * 12) + (assetIdBigInt % 11n);
          const treasuryBps =
            BPS_SCALE + BigInt(dayIndex * 6) + (assetIdBigInt % 7n);

          const totalDeposited = scaleByBps(
            BigInt(asset.totalDeposited),
            trendBps,
          );
          const totalBorrowed = scaleByBps(
            BigInt(asset.totalBorrowed),
            borrowedBps,
          );
          const treasuryBalance = scaleByBps(
            BigInt(asset.treasuryBalance),
            treasuryBps,
          );

          const utilizationRateScaled =
            totalDeposited === 0n
              ? 0n
              : (totalBorrowed * RATE_SCALE_16) / totalDeposited;
          const cappedUtilizationRate =
            utilizationRateScaled > 9800000000000000n
              ? 9800000000000000n
              : utilizationRateScaled;

          const depositRate =
            180000000000000n + BigInt(dayIndex) * 1200000000000n;
          const borrowRate =
            420000000000000n + BigInt(dayIndex) * 1900000000000n;

          assetSnapshotRows.push({
            id: idUtil.generateId(),
            assetId: asset.id,
            blockNumber,
            totalDeposited: totalDeposited.toString(),
            totalBorrowed: totalBorrowed.toString(),
            treasuryBalance: treasuryBalance.toString(),
            utilizationRate: cappedUtilizationRate.toString(),
            depositRate: (depositRate > 3000000000000000n
              ? 3000000000000000n
              : depositRate
            ).toString(),
            borrowRate: (borrowRate > 4500000000000000n
              ? 4500000000000000n
              : borrowRate
            ).toString(),
            createdAt,
          });
        }
      }

      if (assetSnapshotRows.length > 0) {
        await dbClient.assetSnapshot.bulkCreate(assetSnapshotRows, {
          transaction: tx,
        });
      }

      const userAssets = userIds.length
        ? await dbClient.userAsset.findAll({
            where: { userId: { [Op.in]: userIds } },
            attributes: ["userId", "depositedAmount", "borrowedAmount"],
            include: [
              {
                model: dbClient.asset,
                attributes: ["decimals"],
                required: true,
              },
            ],
            transaction: tx,
          })
        : [];

      const userBase = new Map<
        string,
        { depositedUSD: bigint; borrowedUSD: bigint }
      >();
      for (const user of users) {
        userBase.set(user.id.toString(), { depositedUSD: 0n, borrowedUSD: 0n });
      }

      for (const row of userAssets) {
        const key = row.userId.toString();
        const state = userBase.get(key);
        if (!state) {
          continue;
        }

        const decimals = Number(
          (
            row as unknown as {
              asset?: { decimals?: number };
              Asset?: { decimals?: number };
            }
          ).asset?.decimals ??
            (
              row as unknown as {
                asset?: { decimals?: number };
                Asset?: { decimals?: number };
              }
            ).Asset?.decimals ??
            18,
        );

        state.depositedUSD += normalizeTo18(
          BigInt(row.depositedAmount),
          decimals,
        );
        state.borrowedUSD += normalizeTo18(
          BigInt(row.borrowedAmount),
          decimals,
        );
      }

      const userSnapshotRows: Array<{
        id: string;
        userId: bigint;
        blockNumber: number;
        totalDepositedUSD: string;
        totalBorrowedUSD: string;
        netWorthUSD: string;
        healthFactor: string;
        createdAt: Date;
      }> = [];

      for (let dayIndex = 0; dayIndex < days; dayIndex += 1) {
        const createdAt = new Date(
          startDate.getTime() + dayIndex * ONE_DAY_MS + 12 * 60 * 60 * 1000,
        );
        const blockNumber = blockNumberStart + dayIndex;

        for (const user of users) {
          const userIdBigInt = BigInt(user.id);
          const base = userBase.get(user.id.toString()) ?? {
            depositedUSD: 0n,
            borrowedUSD: 0n,
          };

          const depositedBps =
            BPS_SCALE + BigInt(dayIndex * 15) + (userIdBigInt % 13n);
          const borrowedBps =
            BPS_SCALE + BigInt(dayIndex * 10) + (userIdBigInt % 9n);

          const totalDepositedUSD = scaleByBps(base.depositedUSD, depositedBps);
          const totalBorrowedUSD = scaleByBps(base.borrowedUSD, borrowedBps);
          const netWorthUSD =
            totalDepositedUSD > totalBorrowedUSD
              ? totalDepositedUSD - totalBorrowedUSD
              : 0n;

          const healthFactor =
            totalBorrowedUSD === 0n
              ? MAX_UINT256
              : (totalDepositedUSD * SCALE_18) / totalBorrowedUSD;

          userSnapshotRows.push({
            id: idUtil.generateId(),
            userId: user.id,
            blockNumber,
            totalDepositedUSD: totalDepositedUSD.toString(),
            totalBorrowedUSD: totalBorrowedUSD.toString(),
            netWorthUSD: netWorthUSD.toString(),
            healthFactor: healthFactor.toString(),
            createdAt,
          });
        }
      }

      if (userSnapshotRows.length > 0) {
        await dbClient.userSnapshot.bulkCreate(userSnapshotRows, {
          transaction: tx,
        });
      }
    });

    const createdAssetSnapshots = assets.length * days;
    const createdUserSnapshots = users.length * days;

    logger.info(
      "Seed snapshots completed: chainId={chainId}, days={days}, assetRows={assetRows}, userRows={userRows}",
      {
        chainId,
        days,
        assetRows: createdAssetSnapshots,
        userRows: createdUserSnapshots,
      },
    );

    return {
      chainId,
      days,
      createdAssetSnapshots,
      createdUserSnapshots,
    };
  }

  return {
    seedSnapshots,
  };
}

export type SeedService = ReturnType<typeof createSeedService>;
