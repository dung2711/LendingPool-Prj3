import axiosClient from "@/lib/axios";
import { authService } from "./authService";

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
    address: string;
    chainId: string;
    fromDate?: string;
    toDate?: string;
    interval?: "1h" | "6h" | "1d" | "7d";
  }): Promise<UserSnapshotPoint[]> {
    const { address, chainId, ...query } = params;
    const data = await authService.requestWithAuthRetry<{
      success: true;
      snapshots: UserSnapshotPoint[];
    }>({
      address,
      chainId,
      request: () =>
        axiosClient.get("/api/snapshots/user-snapshots", {
          params: query,
        }),
      fallbackErrorMessage: "Failed to fetch user snapshots",
    });

    return data.snapshots;
  },
};
