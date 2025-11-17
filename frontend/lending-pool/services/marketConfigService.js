import axiosClient from "@/lib/axios";

export const getMarketConfig = async (address) => {
    const response = await axiosClient.get(`/market-config/${address}`);
    return response.data;
}