import { createSessionService } from "src/modules/auth/services/session.service";
import { ErrCode } from "src/shared/constants";
import { createMockDbClient, createMockLogger } from "test/shared/mocks";
import { describe, expect, it, vi } from "vitest";
import { createSessionRow, createUserRow } from "../../test-helpers/domain";
import { expectAppErr } from "../../test-helpers/error";

function createTestContext() {
  const dbClient = createMockDbClient();
  const logger = createMockLogger();
  const tokenService = {
    generateAccessToken: vi.fn(async () => "mock-access-token"),
    verifyAccessToken: vi.fn(),
  };
  const idUtil = {
    generateId: vi.fn(() => "generated-id-1"),
    snowflakeId: vi.fn(() => 9999n),
  };
  const env = { JWT_REFRESH_TOKEN_TTL_SECONDS: 604800 };

  const service = createSessionService({
    dbClient: dbClient as never,
    tokenService,
    idUtil,
    logger: logger as never,
    env,
  });

  return { service, dbClient, tokenService, idUtil, logger };
}

describe("SessionService", () => {
  describe("createSessionWithMeta", () => {
    it("should create session record and return auth response", async () => {
      const { service, dbClient, tokenService } = createTestContext();

      const user = createUserRow();
      const result = await service.createSessionWithMeta({
        user: user as never,
        clientIp: "127.0.0.1",
        userAgent: "test-agent",
      });

      expect(dbClient.session.create).toHaveBeenCalledTimes(1);
      const sessionCreateArg = (
        dbClient.session.create as ReturnType<typeof vi.fn>
      ).mock.calls[0]![0] as Record<string, unknown>;
      expect(sessionCreateArg.device).toBe("test-agent");
      expect(sessionCreateArg.ip).toBe("127.0.0.1");
      expect(sessionCreateArg.createdById).toBe(user.id);

      expect(tokenService.generateAccessToken).toHaveBeenCalledTimes(1);
      expect(result.accessToken).toBe("mock-access-token");
      expect(result.sessionId).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.user.userAddress).toBe(user.userAddress);
    });
  });

  describe("refreshToken", () => {
    it("should return new access token for valid session", async () => {
      const { service, dbClient } = createTestContext();
      const session = createSessionRow();
      const user = createUserRow({ id: session.createdById });

      (dbClient.session.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(
        session,
      );
      (dbClient.user.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(
        user,
      );

      const result = await service.refreshToken({
        refreshToken: session.token,
      });

      expect(result.accessToken).toBe("mock-access-token");
      expect(result.refreshToken).toBe(session.token);
    });

    it("should throw SessionNotFound for unknown refresh token", async () => {
      const { service, dbClient } = createTestContext();
      (dbClient.session.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(
        null,
      );

      await expectAppErr(
        service.refreshToken({ refreshToken: "unknown-token" }),
        ErrCode.SessionNotFound,
      );
    });

    it("should throw SessionRevoked for revoked session", async () => {
      const { service, dbClient } = createTestContext();
      const session = createSessionRow({ revoked: true });
      (dbClient.session.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(
        session,
      );

      await expectAppErr(
        service.refreshToken({ refreshToken: session.token }),
        ErrCode.SessionRevoked,
      );
    });

    it("should throw SessionExpired for expired session", async () => {
      const { service, dbClient } = createTestContext();
      const session = createSessionRow({
        expired: new Date(Date.now() - 1000),
      });
      (dbClient.session.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(
        session,
      );

      await expectAppErr(
        service.refreshToken({ refreshToken: session.token }),
        ErrCode.SessionExpired,
      );
    });

    it("should throw SessionNotFound if session user no longer exists", async () => {
      const { service, dbClient } = createTestContext();
      const session = createSessionRow();
      (dbClient.session.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(
        session,
      );
      (dbClient.user.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(
        null,
      );

      await expectAppErr(
        service.refreshToken({ refreshToken: session.token }),
        ErrCode.SessionNotFound,
      );
    });
  });

  describe("revokeSession", () => {
    it("should mark session as revoked", async () => {
      const { service, dbClient } = createTestContext();
      (dbClient.session.update as ReturnType<typeof vi.fn>).mockResolvedValue([
        1,
      ]);

      const result = await service.revokeSession({
        userId: "1001",
        userAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        chainId: "11155111",
        sessionId: "session-1",
      });

      expect(result).toEqual({ success: true });
      expect(dbClient.session.update).toHaveBeenCalledWith(
        { revoked: true },
        expect.objectContaining({
          where: {
            id: "session-1",
            createdById: "1001",
          },
        }),
      );
    });

    it("should throw SessionNotFound if no rows updated", async () => {
      const { service, dbClient } = createTestContext();
      (dbClient.session.update as ReturnType<typeof vi.fn>).mockResolvedValue([
        0,
      ]);

      await expectAppErr(
        service.revokeSession({
          userId: "1001",
          userAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
          chainId: "11155111",
          sessionId: "non-existent",
        }),
        ErrCode.SessionNotFound,
      );
    });
  });
});
