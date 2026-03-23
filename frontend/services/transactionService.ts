import axiosClient from "@/lib/axios";

export interface Transaction {
  id: string;
  userAddress: string;
  type: string;
  assetAddress: string;
  amount: string;
  timestamp: number;
  blockNumber: number;
  transactionHash: string;
}

export interface PaginatedTransactions {
  transactions: Transaction[];
  nextCursorTS?: number;
  nextCursorID?: string;
  hasMore: boolean;
}

export interface GetTransactionsParams {
  userAddress: string;
  cursorTS?: number;
  cursorId?: string;
  type?: string;
  limit?: number;
}

export const transactionService = {
  async getTransactionsByUserAddress(
    params: GetTransactionsParams,
  ): Promise<PaginatedTransactions> {
    const response = await axiosClient.get("/api/transactions", {
      params: {
        userAddress: params.userAddress,
        cursorTS: params.cursorTS,
        cursorId: params.cursorId,
        type: params.type,
        limit: params.limit,
      },
    });
    return response.data;
  },
};
