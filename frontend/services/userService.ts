import axiosClient from "@/lib/axios";

export interface User {
  id: string;
  userAddress: string;
  joinedAt: string;
}

export const userService = {
  async getUserByAddress(address: string): Promise<User> {
    const response = await axiosClient.get("/api/users/detail", {
      params: { userAddress: address },
    });
    return response.data.user;
  },
};
