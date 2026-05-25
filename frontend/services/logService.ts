import axiosClient from "@/lib/axios";

export interface AccrueLogPoint {
  id: string;
  assetId: string;
  assetAddress: string;
  assetSymbol: string;
  assetName: string;
  transactionHash: string;
  blockNumber: string;
  interestAccrued: string;
  toDepositors: string;
  toTreasury: string;
  newTotalBorrows: string;
  newBorrowIndex: string;
  newTotalDeposits: string;
  newDepositIndex: string;
  createdAt: string;
}

export interface TreasuryLogPoint {
  id: string;
  assetId: string;
  assetAddress: string;
  assetSymbol: string;
  assetName: string;
  transactionHash: string;
  blockNumber: string;
  eventType: string;
  amount: string;
  balanceAfter: string;
  fromAddress: string | null;
  toAddress: string | null;
  createdAt: string;
}

export const logService = {
  async getAccrueLogs(params: {
    assetId?: string;
    fromDate?: string;
    toDate?: string;
    take?: number;
    skip?: number;
    limit?: number;
    interval?: "1h" | "6h" | "1d" | "7d";
  }): Promise<AccrueLogPoint[]> {
    const { limit, take, skip, assetId, fromDate, toDate, interval } = params;
    const response = await axiosClient.get("/api/logs/accrue", {
      params: {
        assetId,
        fromDate,
        toDate,
        interval,
        take: take ?? limit,
        skip,
      },
    });
    return response.data.logs;
  },

  async getTreasuryLogs(params: {
    assetId?: string;
    fromDate?: string;
    toDate?: string;
    take?: number;
    skip?: number;
    limit?: number;
    interval?: "1h" | "6h" | "1d" | "7d";
  }): Promise<TreasuryLogPoint[]> {
    const { limit, take, skip, assetId, fromDate, toDate, interval } = params;
    const response = await axiosClient.get("/api/logs/treasury", {
      params: {
        assetId,
        fromDate,
        toDate,
        interval,
        take: take ?? limit,
        skip,
      },
    });
    return response.data.logs;
  },
};
