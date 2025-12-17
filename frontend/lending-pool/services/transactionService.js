import axiosClient from "@/lib/axios";

export const getTransactionsByUserAddress = async (address, cursorTS, cursorId, type) => {
    console.log({ cursorTS, cursorId, type });
    const response = await axiosClient.get(`/transactions/${address}`, {
        params: { cursorTS, cursorId, type }
    });
    return response.data;
}