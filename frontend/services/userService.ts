import axiosClient from "@/lib/axios";
import { authService } from "./authService";

const DEFAULT_CHAIN_ID = process.env.NEXT_PUBLIC_CHAIN_ID || "11155111";

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
    const data = await authService.requestWithAuthRetry<{
      success: true;
      user: User;
    }>({
      address,
      chainId,
      request: () => axiosClient.get("/api/users/detail"),
      fallbackErrorMessage: "Failed to fetch user details",
    });

    return data.user;
  },
  async getEmailByAddress(
    address: string,
    chainId: string,
  ): Promise<UserEmailLookup> {
    const data = await authService.requestWithAuthRetry<UserEmailLookup>({
      address,
      chainId,
      request: () => axiosClient.get("/api/users/email"),
      fallbackErrorMessage: "Failed to fetch user email",
    });

    return data;
  },
};
