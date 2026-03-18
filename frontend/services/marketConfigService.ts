import axiosClient from "@/lib/axios";
import type { AssetConfig } from "./assetService";

export const marketConfigService = {
  async getMarketConfig(address: string): Promise<AssetConfig> {
    const response = await axiosClient.get("/api/assets/config", {
      params: { assetAddress: address },
    });
    return response.data.assetConfig;
  },
};
