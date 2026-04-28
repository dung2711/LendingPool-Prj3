import axiosClient from "@/lib/axios";
import type { Asset } from "./assetService";

const DEFAULT_CHAIN_ID = process.env.NEXT_PUBLIC_CHAIN_ID || "11155111";

function normalizeChainId(chainId: string): string {
  const trimmed = chainId.trim();
  if (!trimmed) return trimmed;

  const normalized = Number(trimmed);
  if (Number.isInteger(normalized) && normalized > 0) {
    return String(normalized);
  }

  return trimmed;
}

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
  async getAssetsByUser(
    address: string,
    chainId: string = DEFAULT_CHAIN_ID,
  ): Promise<DashboardData> {
    const response = await axiosClient.get("/api/users/dashboard", {
      params: {
        userAddress: address,
        chainId: normalizeChainId(chainId),
      },
    });
    return response.data;
  },
};
