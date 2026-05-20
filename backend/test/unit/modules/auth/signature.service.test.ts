import { ethers } from "ethers";
import {
  buildAuthMessage,
  createSignatureService,
} from "src/modules/auth/services/signature.service";
import { ErrCode } from "src/shared/constants";
import {
  createMockDbClient,
  createMockLogger,
  createMockRedis,
} from "test/shared/mocks";
import { describe, expect, it, vi } from "vitest";
import { createUserRow } from "../../test-helpers/domain";
import { expectAppErr } from "../../test-helpers/error";

function createTestContext() {
  const redis = createMockRedis();
  const dbClient = createMockDbClient();
  const logger = createMockLogger();
  const idUtil = {
    generateId: vi.fn(() => "generated-nonce-1"),
    snowflakeId: vi.fn(() => 9999n),
  };
  const sessionService = {
    createSessionWithMeta: vi.fn(async () => ({
      user: {
        id: "1001",
        userAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        chainId: "11155111",
      },
      sessionId: "session-1",
      accessToken: "mock-access-token",
      refreshToken: "mock-refresh-token",
    })),
    revokeSession: vi.fn(),
    refreshToken: vi.fn(),
  };
  const rateLimit = {
    ensureCooldown: vi.fn(async () => undefined),
    ensureAttemptLimit: vi.fn(async () => undefined),
  };
  const env = { AUTH_NONCE_TTL_SECONDS: 300 };

  const service = createSignatureService({
    redis: redis as never,
    dbClient: dbClient as never,
    sessionService,
    idUtil,
    logger: logger as never,
    rateLimit,
    env,
  });

  return {
    service,
    redis,
    dbClient,
    sessionService,
    idUtil,
    rateLimit,
    logger,
  };
}

describe("SignatureService", () => {
  describe("buildAuthMessage", () => {
    it("should return a correctly formatted auth message", () => {
      const message = buildAuthMessage({
        userAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        chainId: "11155111",
        nonce: "test-nonce",
      });

      expect(message).toContain("Welcome to Lending Pool.");
      expect(message).toContain("0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
      expect(message).toContain("Chain ID: 11155111");
      expect(message).toContain("Nonce: test-nonce");
    });
  });

  describe("sendNonce", () => {
    it("should store nonce in Redis and return message with expiry", async () => {
      const { service, redis } = createTestContext();

      const result = await service.sendNonce({
        userAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        chainId: "11155111",
      });

      expect(result.success).toBe(true);
      expect(result.expiresIn).toBe(300);
      expect(result.message).toContain("Welcome to Lending Pool.");
      expect(result.message).toContain("Nonce: generated-nonce-1");

      expect(redis.set).toHaveBeenCalledWith(
        "auth:nonce:11155111:0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        "generated-nonce-1",
        "EX",
        300,
      );
    });

    it("should rate-limit duplicate nonce requests", async () => {
      const { service, rateLimit } = createTestContext();
      rateLimit.ensureCooldown.mockRejectedValue(
        new (await import("src/shared/constants")).AppErr(
          ErrCode.RateLimitExceeded,
          { errors: "Too many requests" },
        ),
      );

      await expectAppErr(
        service.sendNonce({
          userAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
          chainId: "11155111",
        }),
        ErrCode.RateLimitExceeded,
      );
    });

    it("should reject invalid Ethereum address", async () => {
      const { service } = createTestContext();

      await expectAppErr(
        service.sendNonce({
          userAddress: "0xinvalid",
          chainId: "11155111",
        }),
        ErrCode.BadRequest,
      );
    });
  });

  describe("verifyMessage", () => {
    it("should authenticate valid signature and create session", async () => {
      const { service, redis, dbClient, sessionService } = createTestContext();

      // Generate a real wallet to produce a valid signature
      const wallet = ethers.Wallet.createRandom();
      const checksumAddress = ethers.getAddress(wallet.address);
      const nonce = "test-nonce-123";
      const message = buildAuthMessage({
        userAddress: checksumAddress,
        chainId: "11155111",
        nonce,
      });
      const signature = await wallet.signMessage(message);

      (redis.get as ReturnType<typeof vi.fn>).mockResolvedValue(nonce);

      const userRow = createUserRow({ userAddress: checksumAddress });
      (
        dbClient.user.findOrCreate as ReturnType<typeof vi.fn>
      ).mockResolvedValue([userRow, true]);

      const result = await service.verifyMessage(
        { userAddress: checksumAddress, chainId: "11155111", signature },
        { clientIp: "127.0.0.1", userAgent: "test-agent" },
      );

      expect(result.accessToken).toBe("mock-access-token");
      expect(sessionService.createSessionWithMeta).toHaveBeenCalledTimes(1);
      expect(redis.del).toHaveBeenCalledWith(
        `auth:nonce:11155111:${checksumAddress}`,
      );
    });

    it("should reject when nonce is expired or missing", async () => {
      const { service, redis } = createTestContext();
      (redis.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expectAppErr(
        service.verifyMessage(
          {
            userAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
            chainId: "11155111",
            signature: "0xfakesignature",
          },
          { clientIp: "127.0.0.1", userAgent: "test-agent" },
        ),
        ErrCode.Unauthorized,
      );
    });

    it("should reject when signature does not match address", async () => {
      const { service, redis } = createTestContext();

      // Use a different wallet to sign than the address claimed
      const wallet = ethers.Wallet.createRandom();
      const claimedAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
      const nonce = "test-nonce-123";
      const message = buildAuthMessage({
        userAddress: claimedAddress,
        chainId: "11155111",
        nonce,
      });
      const signature = await wallet.signMessage(message);

      (redis.get as ReturnType<typeof vi.fn>).mockResolvedValue(nonce);

      await expectAppErr(
        service.verifyMessage(
          { userAddress: claimedAddress, chainId: "11155111", signature },
          { clientIp: "127.0.0.1", userAgent: "test-agent" },
        ),
        ErrCode.Unauthorized,
      );
    });

    it("should create user on first login via findOrCreate", async () => {
      const { service, redis, dbClient } = createTestContext();

      const wallet = ethers.Wallet.createRandom();
      const checksumAddress = ethers.getAddress(wallet.address);
      const nonce = "test-nonce-123";
      const message = buildAuthMessage({
        userAddress: checksumAddress,
        chainId: "11155111",
        nonce,
      });
      const signature = await wallet.signMessage(message);

      (redis.get as ReturnType<typeof vi.fn>).mockResolvedValue(nonce);
      const userRow = createUserRow({ userAddress: checksumAddress });
      (
        dbClient.user.findOrCreate as ReturnType<typeof vi.fn>
      ).mockResolvedValue([userRow, true]);

      await service.verifyMessage(
        { userAddress: checksumAddress, chainId: "11155111", signature },
        { clientIp: "127.0.0.1", userAgent: "test-agent" },
      );

      expect(dbClient.user.findOrCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userAddress: checksumAddress, chainId: "11155111" },
        }),
      );
    });

    it("should delete nonce from Redis after successful verification", async () => {
      const { service, redis, dbClient } = createTestContext();

      const wallet = ethers.Wallet.createRandom();
      const checksumAddress = ethers.getAddress(wallet.address);
      const nonce = "test-nonce-123";
      const message = buildAuthMessage({
        userAddress: checksumAddress,
        chainId: "11155111",
        nonce,
      });
      const signature = await wallet.signMessage(message);

      (redis.get as ReturnType<typeof vi.fn>).mockResolvedValue(nonce);
      (
        dbClient.user.findOrCreate as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        createUserRow({ userAddress: checksumAddress }),
        true,
      ]);

      await service.verifyMessage(
        { userAddress: checksumAddress, chainId: "11155111", signature },
        { clientIp: "127.0.0.1", userAgent: "test-agent" },
      );

      expect(redis.del).toHaveBeenCalledWith(
        `auth:nonce:11155111:${checksumAddress}`,
      );
    });
  });
});
