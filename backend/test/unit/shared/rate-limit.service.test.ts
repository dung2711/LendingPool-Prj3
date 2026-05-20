import { ErrCode } from "src/shared/constants";
import { createRateLimitService } from "src/shared/utils/rate-limit.service";
import { createMockRedis } from "test/shared/mocks";
import { describe, expect, it, type vi } from "vitest";
import { expectAppErr } from "../test-helpers/error";

function createTestContext() {
  const redis = createMockRedis();

  const service = createRateLimitService({ redis: redis as never });

  return { service, redis };
}

describe("RateLimitService", () => {
  describe("ensureCooldown", () => {
    it("should pass on first call (SET NX returns OK)", async () => {
      const { service, redis } = createTestContext();
      (redis.call as ReturnType<typeof vi.fn>).mockResolvedValue("OK");

      // Should not throw
      await service.ensureCooldown({
        key: "test-key",
        cooldownSeconds: 30,
      });

      expect(redis.call).toHaveBeenCalledWith("SET", [
        "rate_limit:test-key",
        expect.any(String),
        "NX",
        "EX",
        "30",
      ]);
    });

    it("should throw RateLimitExceeded on duplicate within cooldown", async () => {
      const { service, redis } = createTestContext();
      (redis.call as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expectAppErr(
        service.ensureCooldown({
          key: "test-key",
          cooldownSeconds: 30,
          message: "Too many requests",
        }),
        ErrCode.RateLimitExceeded,
      );
    });
  });

  describe("ensureAttemptLimit", () => {
    it("should pass when under limit", async () => {
      const { service, redis } = createTestContext();
      (redis.call as ReturnType<typeof vi.fn>).mockResolvedValue(1);

      // Should not throw
      await service.ensureAttemptLimit({
        key: "attempt-key",
        maxAttempts: 5,
        cooldownSeconds: 300,
      });
    });

    it("should throw when over limit", async () => {
      const { service, redis } = createTestContext();
      (redis.call as ReturnType<typeof vi.fn>).mockResolvedValue(6);

      await expectAppErr(
        service.ensureAttemptLimit({
          key: "attempt-key",
          maxAttempts: 5,
          cooldownSeconds: 300,
        }),
        ErrCode.RateLimitExceeded,
      );
    });
  });
});
