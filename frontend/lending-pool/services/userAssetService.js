import axiosClient from "@/lib/axios";

export const getAssetsByUser = async (address) => {
    const response = await axiosClient.get(`/user-assets/${address}`);
    return response.data;
}