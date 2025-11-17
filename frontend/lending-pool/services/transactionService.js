import axiosClient from "@/lib/axios";

export const getTransactionsByUserAddress = async (address) => {
    const response = await axiosClient.get(`/transactions/${address}`);
    return response.data;
}