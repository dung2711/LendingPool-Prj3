import axiosClient from "@/lib/axios";

export interface Asset {
  id: string;
  assetAddress: string;
  symbol: string;
  name: string;
  decimals: number;
  isSupported: boolean;
  totalDeposited: string;
  totalBorrowed: string;
}

export interface AssetDetail extends Asset {}

export interface AssetConfig {
  assetAddress: string;
  baseRate: number;
  slope1: number;
  slope2: number;
  optimalUtilization: number;
  reserveFactor: number;
  collateralFactor: number;
  closeFactor: number;
  liquidationIncentive: number;
  liquidationThreshold: number;
}

export const assetService = {
  async getAllAssets(params?: {
    take?: number;
    skip?: number;
  }): Promise<Asset[]> {
    const { take = 1000, skip = 0 } = params ?? {};
    const response = await axiosClient.get("/api/assets/list", {
      params: { take, skip },
    });
    return response.data.assets;
  },

  async getAssetByAddress(address: string): Promise<AssetDetail> {
    const response = await axiosClient.get("/api/assets/detail", {
      params: { assetAddress: address },
    });
    return response.data.asset;
  },

  async getAssetConfig(address: string): Promise<AssetConfig> {
    const response = await axiosClient.get("/api/assets/config", {
      params: { assetAddress: address },
    });
    return response.data.assetConfig;
  },
};
