import type { DatabaseClient } from "src/shared/infra";
import {
  buildDateRangeWhere,
  type ChartInterval,
  downsampleByInterval,
} from "src/shared/utils";
import type { IAccrueLogReq, ITreasuryLogReq } from "../log.dto";

export function createLogQueryService(deps: { dbClient: DatabaseClient }) {
  const { dbClient } = deps;

  async function listAccrueLogs(params: IAccrueLogReq) {
    const { assetId, fromDate, toDate, limit, interval = "1d" } = params;

    const where = {
      ...(assetId ? { assetId: BigInt(assetId) } : {}),
      ...buildDateRangeWhere(fromDate, toDate),
    };

    const rows = await dbClient.accrueLog.findAll({
      where,
      include: [
        {
          model: dbClient.asset,
          attributes: ["assetAddress", "symbol", "name"],
          required: true,
        },
      ],
      order: [["createdAt", "DESC"]],
      limit,
    });

    return downsampleByInterval(rows.reverse(), interval as ChartInterval).map(
      (row) => {
        const asset = (
          row as unknown as {
            asset?: { assetAddress?: string; symbol?: string; name?: string };
          }
        ).asset;

        return {
          id: row.id,
          assetId: row.assetId.toString(),
          assetAddress: asset?.assetAddress ?? "",
          assetSymbol: asset?.symbol ?? "",
          assetName: asset?.name ?? "",
          transactionHash: row.transactionHash,
          blockNumber: row.blockNumber.toString(),
          interestAccrued: row.interestAccrued,
          toDepositors: row.toDepositors,
          toTreasury: row.toTreasury,
          newTotalBorrows: row.newTotalBorrows,
          newBorrowIndex: row.newBorrowIndex,
          newTotalDeposits: row.newTotalDeposits,
          newDepositIndex: row.newDepositIndex,
          createdAt: row.createdAt.toISOString(),
        };
      },
    );
  }

  async function listTreasuryLogs(params: ITreasuryLogReq) {
    const { assetId, fromDate, toDate, limit, interval = "1d" } = params;

    const where = {
      ...(assetId ? { assetId: BigInt(assetId) } : {}),
      ...buildDateRangeWhere(fromDate, toDate),
    };

    const rows = await dbClient.treasuryLog.findAll({
      where,
      include: [
        {
          model: dbClient.asset,
          attributes: ["assetAddress", "symbol", "name"],
          required: true,
        },
      ],
      order: [["createdAt", "DESC"]],
      limit,
    });

    return downsampleByInterval(rows.reverse(), interval as ChartInterval).map(
      (row) => {
        const asset = (
          row as unknown as {
            asset?: { assetAddress?: string; symbol?: string; name?: string };
          }
        ).asset;

        return {
          id: row.id,
          assetId: row.assetId.toString(),
          assetAddress: asset?.assetAddress ?? "",
          assetSymbol: asset?.symbol ?? "",
          assetName: asset?.name ?? "",
          transactionHash: row.transactionHash,
          blockNumber: row.blockNumber.toString(),
          eventType: row.eventType,
          amount: row.amount,
          balanceAfter: row.balanceAfter,
          fromAddress: row.fromAddress,
          toAddress: row.toAddress,
          createdAt: row.createdAt.toISOString(),
        };
      },
    );
  }

  return {
    listAccrueLogs,
    listTreasuryLogs,
  };
}

export type LogQueryService = ReturnType<typeof createLogQueryService>;
