import type { DatabaseClient } from "src/shared/infra";
import {
  buildDateRangeWhere,
  type ChartInterval,
  downsampleByInterval,
} from "src/shared/utils";
import type { IAssetSnapshotReq, IUserSnapshotReq } from "../snapshot.dto";

export function createSnapshotQueryService(deps: { dbClient: DatabaseClient }) {
  const { dbClient } = deps;

  async function getAssetSnapshots(params: IAssetSnapshotReq) {
    const { assetId, fromDate, toDate, interval = "1d" } = params;

    const where = {
      assetId: BigInt(assetId),
      ...buildDateRangeWhere(fromDate, toDate),
    };

    const snapshots = await dbClient.assetSnapshot.findAll({
      where,
      order: [["createdAt", "ASC"]],
    });

    return downsampleByInterval(snapshots, interval as ChartInterval).map(
      (s) => ({
        assetId: s.assetId.toString(),
        totalDeposited: s.totalDeposited,
        totalBorrowed: s.totalBorrowed,
        treasuryBalance: s.treasuryBalance,
        utilizationRate: s.utilizationRate,
        depositRate: s.depositRate,
        borrowRate: s.borrowRate,
        createdAt: s.createdAt.toISOString(),
        blockNumber: s.blockNumber,
      }),
    );
  }

  async function getUserSnapshots(params: IUserSnapshotReq) {
    const { userId, fromDate, toDate, interval = "1d" } = params;

    const where = {
      userId: BigInt(userId),
      ...buildDateRangeWhere(fromDate, toDate),
    };

    const snapshots = await dbClient.userSnapshot.findAll({
      where,
      order: [["createdAt", "ASC"]],
    });

    return downsampleByInterval(snapshots, interval as ChartInterval).map(
      (s) => ({
        userId: s.userId.toString(),
        totalDepositedUSD: s.totalDepositedUSD,
        totalBorrowedUSD: s.totalBorrowedUSD,
        netWorthUSD: s.netWorthUSD,
        healthFactor: s.healthFactor,
        createdAt: s.createdAt.toISOString(),
        blockNumber: s.blockNumber,
      }),
    );
  }

  return {
    getAssetSnapshots,
    getUserSnapshots,
  };
}

export type SnapshotQueryService = ReturnType<
  typeof createSnapshotQueryService
>;
