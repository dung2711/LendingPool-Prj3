import { ethers } from "ethers";
import axiosClient from "@/lib/axios";
import { web3Service } from "@/lib/web3";
import { type Asset, assetService } from "./assetService";
import { authService } from "./authService";

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

async function getAssetsForAnyUser(address: string): Promise<DashboardData> {
  const checksumAddress = ethers.getAddress(address);
  const [lendingPool, allAssets] = await Promise.all([
    web3Service.getLendingPoolContract(),
    assetService.getAllAssets(),
  ]);

  const assetRows = await Promise.all(
    allAssets.map(async (asset) => {
      const [depositedAmount, borrowedAmount] = await Promise.all([
        lendingPool.getUserCurrentDeposit(checksumAddress, asset.assetAddress),
        lendingPool.getUserCurrentBorrow(checksumAddress, asset.assetAddress),
      ]);

      if (depositedAmount === 0n && borrowedAmount === 0n) {
        return null;
      }

      return {
        ...asset,
        depositedAmount: depositedAmount.toString(),
        borrowedAmount: borrowedAmount.toString(),
      } satisfies UserAsset;
    }),
  );

  return {
    user: {
      id: "",
      userAddress: checksumAddress,
      joinedAt: "",
    },
    assets: assetRows.filter((asset): asset is UserAsset => asset !== null),
  };
}

export const userAssetService = {
  async getAssetsByUser(
    address: string,
    chainId?: string,
  ): Promise<DashboardData> {
    if (!chainId) {
      return getAssetsForAnyUser(address);
    }

    const data = await authService.requestWithAuthRetry<{
      success: true;
      user: DashboardData["user"];
      assets: UserAsset[];
    }>({
      address,
      chainId,
      request: () => axiosClient.get("/api/users/dashboard"),
      fallbackErrorMessage: "Failed to fetch dashboard data",
    });

    return data;
  },
};
