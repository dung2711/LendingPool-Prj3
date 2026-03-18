import axiosClient from "@/lib/axios";
import type { Asset } from "./assetService";

export interface UserAsset extends Asset {
  depositedAmount: string;
  borrowedAmount: string;
}

export interface DashboardData {
  user: {
    id: string;
    userAddress: string;
    joinedAt: string;
  };
  assets: UserAsset[];
}

export const userAssetService = {
  async getAssetsByUser(address: string): Promise<DashboardData> {
    const response = await axiosClient.get("/api/users/dashboard", {
      params: { userAddress: address },
    });
    return response.data;
  },
};
