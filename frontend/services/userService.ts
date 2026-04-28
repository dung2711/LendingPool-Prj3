import axiosClient from "@/lib/axios";

const DEFAULT_CHAIN_ID = process.env.NEXT_PUBLIC_CHAIN_ID || "11155111";

function normalizeChainId(chainId: string): string {
  const trimmed = chainId.trim();
  if (!trimmed) return trimmed;

  const normalized = Number(trimmed);
  if (Number.isInteger(normalized) && normalized > 0) {
    return String(normalized);
  }

  return trimmed;
}

export interface User {
  id: string;
  userAddress: string;
  joinedAt: string;
}

export interface UserEmailLookup {
  success: true;
  email: string | null;
  found: boolean;
}

export const userService = {
  async getUserByAddress(
    address: string,
    chainId: string = DEFAULT_CHAIN_ID,
  ): Promise<User> {
    const response = await axiosClient.get("/api/users/detail", {
      params: {
        userAddress: address,
        chainId: normalizeChainId(chainId),
      },
    });
    return response.data.user;
  },
  async getEmailByAddress(
    address: string,
    chainId: string,
  ): Promise<UserEmailLookup> {
    const response = await axiosClient.get("/api/users/email", {
      params: {
        userAddress: address,
        chainId: normalizeChainId(chainId),
      },
    });
    return response.data;
  },
};
