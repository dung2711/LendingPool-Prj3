import { createUserService } from "src/modules/users/user.service";
import { ErrCode } from "src/shared/constants";
import { createMockDbClient, createMockLogger } from "test/shared/mocks";
import { describe, expect, it, type vi } from "vitest";
import { createUserRow } from "../../test-helpers/domain";
import { expectAppErr } from "../../test-helpers/error";

function createTestContext() {
  const dbClient = createMockDbClient();
  const logger = createMockLogger();

  const service = createUserService({
    dbClient: dbClient as never,
    logger: logger as never,
  });

  return { service, dbClient, logger };
}

const validAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

describe("UserService", () => {
  describe("getUserDetail", () => {
    it("should return formatted user detail", async () => {
      const { service, dbClient } = createTestContext();
      const user = createUserRow({ userAddress: validAddress });
      (dbClient.user.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(
        user,
      );

      const result = await service.getUserDetail({
        userId: "1001",
        userAddress: validAddress,
        chainId: "11155111",
        sessionId: "s1",
      });

      expect(result.id).toBe("1001");
      expect(result.userAddress).toBe(validAddress);
      expect(result.chainId).toBe("11155111");
    });

    it("should throw UserNotFound when user does not exist", async () => {
      const { service, dbClient } = createTestContext();
      (dbClient.user.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(
        null,
      );

      await expectAppErr(
        service.getUserDetail({
          userId: "1001",
          userAddress: validAddress,
          chainId: "11155111",
          sessionId: "s1",
        }),
        ErrCode.UserNotFound,
      );
    });

    it("should reject invalid Ethereum address", async () => {
      const { service } = createTestContext();

      await expectAppErr(
        service.getUserDetail({
          userId: "1001",
          userAddress: "0xinvalid",
          chainId: "11155111",
          sessionId: "s1",
        }),
        ErrCode.BadRequest,
      );
    });
  });

  describe("getDashboardDetail", () => {
    it("should return user and assets", async () => {
      const { service, dbClient } = createTestContext();
      const user = createUserRow({ userAddress: validAddress });
      (dbClient.user.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(
        user,
      );

      const userAssets = [
        {
          depositedAmount: "1000000",
          borrowedAmount: "500000",
          dataValues: {
            assetId: "1",
            assetAddress: "0xUSDC",
            symbol: "USDC",
            name: "USD Coin",
            decimals: 6,
            depositedAmount: "1000000",
            borrowedAmount: "500000",
          },
        },
      ];
      (
        dbClient.userAsset.findAll as ReturnType<typeof vi.fn>
      ).mockResolvedValue(userAssets);

      const result = await service.getDashboardDetail({
        userId: "1001",
        userAddress: validAddress,
        chainId: "11155111",
        sessionId: "s1",
      });

      expect(result.user.id).toBe("1001");
      expect(result.assets).toHaveLength(1);
      expect(result.assets[0]!.symbol).toBe("USDC");
    });

    it("should throw UserNotFound when user does not exist", async () => {
      const { service, dbClient } = createTestContext();
      (dbClient.user.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(
        null,
      );

      await expectAppErr(
        service.getDashboardDetail({
          userId: "1001",
          userAddress: validAddress,
          chainId: "11155111",
          sessionId: "s1",
        }),
        ErrCode.UserNotFound,
      );
    });
  });

  describe("getUserEmail", () => {
    it("should return email when user exists", async () => {
      const { service, dbClient } = createTestContext();
      const user = createUserRow({
        userAddress: validAddress,
        email: "test@example.com",
      });
      (dbClient.user.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(
        user,
      );

      const result = await service.getUserEmail({
        userId: "1001",
        userAddress: validAddress,
        chainId: "11155111",
        sessionId: "s1",
      });

      expect(result.success).toBe(true);
      expect(result.found).toBe(true);
      expect(result.email).toBe("test@example.com");
    });

    it("should return null email when user not found", async () => {
      const { service, dbClient } = createTestContext();
      (dbClient.user.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(
        null,
      );

      const result = await service.getUserEmail({
        userId: "1001",
        userAddress: validAddress,
        chainId: "11155111",
        sessionId: "s1",
      });

      expect(result.success).toBe(true);
      expect(result.found).toBe(false);
      expect(result.email).toBeNull();
    });
  });
});
