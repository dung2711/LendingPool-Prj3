import axiosClient from "@/lib/axios";

export interface AssetSnapshotPoint {
  assetId: string;
  totalDeposited: string;
  totalBorrowed: string;
  treasuryBalance: string;
  utilizationRate: string;
  depositRate: string;
  borrowRate: string;
  createdAt: string;
  blockNumber: number;
}

export interface UserSnapshotPoint {
  userId: string;
  totalDepositedUSD: string;
  totalBorrowedUSD: string;
  netWorthUSD: string;
  healthFactor: string;
  createdAt: string;
  blockNumber: number;
}

export const snapshotService = {
  async getAssetSnapshots(params: {
    assetId: string;
    fromDate?: string;
    toDate?: string;
    interval?: "1h" | "6h" | "1d" | "7d";
  }): Promise<AssetSnapshotPoint[]> {
    const response = await axiosClient.get("/api/snapshots/asset-snapshots", {
      params,
    });

    return response.data.snapshots;
  },

  async getUserSnapshots(params: {
    userId: string;
    fromDate?: string;
    toDate?: string;
    interval?: "1h" | "6h" | "1d" | "7d";
  }): Promise<UserSnapshotPoint[]> {
    const response = await axiosClient.get("/api/snapshots/user-snapshots", {
      params,
    });

    return response.data.snapshots;
  },
};
