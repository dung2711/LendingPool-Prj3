import axiosClient from "@/lib/axios";

export const getUserByAddress = async (address) => {
    const response = await axiosClient.get(`/users/${address}`);
    return response.data;
}