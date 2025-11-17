import axiosClient from "@/lib/axios";

export const getAllAssets = async () => {
    const response = await axiosClient.get('/assets');
    return response.data;
}

export const getAssetByAddress = async (address) => {
    const response = await axiosClient.get(`/assets/${address}`);
    return response.data;
}