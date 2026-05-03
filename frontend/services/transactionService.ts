import axiosClient from "@/lib/axios";
import { authService } from "./authService";

export interface Transaction {
  id: string;
  type: string;
  assetAddress: string;
  amount: string;
  amountUSD: string;
  timestamp: number | null;
  blockNumber: number;
  transactionHash: string;
}

export interface PaginatedTransactions {
  transactions: Transaction[];
  nextCursorTS?: string;
  nextCursorID?: string;
  hasMore: boolean;
}

export interface GetTransactionsParams {
  userAddress: string;
  chainId: string;
  cursorTS?: string;
  cursorId?: string;
  type?: string;
  limit?: number;
}

export const transactionService = {
  async getTransactionsByUserAddress(
    params: GetTransactionsParams,
  ): Promise<PaginatedTransactions> {
    const data = await authService.requestWithAuthRetry<{
      success: true;
      transactions: Array<{
        id: string;
        type: string;
        assetAddress: string;
        amount: string;
        amountUSD: string;
        blockNumber: string;
        transactionHash: string;
      }>;
      nextCursor: { cursorTS: string; cursorID: string } | null;
      hasNextPage: boolean;
    }>({
      address: params.userAddress,
      chainId: params.chainId,
      request: () =>
        axiosClient.get("/api/transactions", {
          params: {
            cursorTS: params.cursorTS,
            cursorID: params.cursorId,
            type: params.type,
            limit: params.limit,
          },
        }),
      fallbackErrorMessage: "Failed to fetch transactions",
    });

    return {
      transactions: data.transactions.map((tx) => ({
        id: tx.id,
        type: tx.type,
        assetAddress: tx.assetAddress,
        amount: tx.amount,
        amountUSD: tx.amountUSD,
        timestamp: null,
        blockNumber: Number(tx.blockNumber),
        transactionHash: tx.transactionHash,
      })),
      nextCursorTS: data.nextCursor?.cursorTS,
      nextCursorID: data.nextCursor?.cursorID,
      hasMore: data.hasNextPage,
    };
  },
};
