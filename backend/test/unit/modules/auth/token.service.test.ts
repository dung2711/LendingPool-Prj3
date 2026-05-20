import { jwtVerify, SignJWT } from "jose";
import { createTokenService } from "src/modules/auth/services/token.service";
import { ErrCode } from "src/shared/constants";
import { beforeEach, describe, expect, it } from "vitest";
import { expectAppErr } from "../../test-helpers/error";

const mockEnv = {
  JWT_ACCESS_TOKEN_SECRET: "test-secret-key-at-least-32-chars-long-!!!",
  JWT_ISSUER: "test-issuer",
  JWT_AUDIENCE: "test-audience",
  JWT_ACCESS_TOKEN_TTL_SECONDS: 3600,
};

describe("TokenService", () => {
  let tokenService: ReturnType<typeof createTokenService>;

  const mockPayload = {
    userId: "user-123",
    userAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    chainId: "11155111",
    sessionId: "session-123",
  };

  beforeEach(() => {
    tokenService = createTokenService({ env: mockEnv });
  });

  describe("generateAccessToken", () => {
    it("should generate a valid JWT with correct payload", async () => {
      const token = await tokenService.generateAccessToken(mockPayload);
      expect(typeof token).toBe("string");

      const { payload } = await jwtVerify(
        token,
        new TextEncoder().encode(mockEnv.JWT_ACCESS_TOKEN_SECRET),
        { issuer: mockEnv.JWT_ISSUER, audience: mockEnv.JWT_AUDIENCE },
      );

      expect(payload.userId).toBe(mockPayload.userId);
      expect(payload.userAddress).toBe(mockPayload.userAddress);
      expect(payload.chainId).toBe(mockPayload.chainId);
      expect(payload.sessionId).toBe(mockPayload.sessionId);
      expect(payload.tokenType).toBe("access");
      expect(payload.sub).toBe(mockPayload.userId);
      expect(payload.iss).toBe(mockEnv.JWT_ISSUER);
      expect(payload.aud).toBe(mockEnv.JWT_AUDIENCE);
      expect(payload.iat).toBeDefined();
      expect(payload.exp).toBeDefined();
    });
  });

  describe("verifyAccessToken", () => {
    it("should return payload for a valid token", async () => {
      const token = await tokenService.generateAccessToken(mockPayload);
      const result = await tokenService.verifyAccessToken(token);

      expect(result.userId).toBe(mockPayload.userId);
      expect(result.userAddress).toBe(mockPayload.userAddress);
      expect(result.chainId).toBe(mockPayload.chainId);
      expect(result.sessionId).toBe(mockPayload.sessionId);
    });

    it("should throw Unauthorized for an expired token", async () => {
      const now = Math.floor(Date.now() / 1000);
      const expiredToken = await new SignJWT({
        ...mockPayload,
        tokenType: "access",
      })
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setSubject(mockPayload.userId)
        .setIssuer(mockEnv.JWT_ISSUER)
        .setAudience(mockEnv.JWT_AUDIENCE)
        .setIssuedAt(now - 7200)
        .setExpirationTime(now - 3600)
        .sign(new TextEncoder().encode(mockEnv.JWT_ACCESS_TOKEN_SECRET));

      await expectAppErr(
        tokenService.verifyAccessToken(expiredToken),
        ErrCode.Unauthorized,
      );
    });

    it("should throw Unauthorized for a token with wrong secret", async () => {
      const wrongSecret = "wrong-secret-key-at-least-32-chars-long-!!!";
      const token = await new SignJWT({
        ...mockPayload,
        tokenType: "access",
      })
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setSubject(mockPayload.userId)
        .setIssuer(mockEnv.JWT_ISSUER)
        .setAudience(mockEnv.JWT_AUDIENCE)
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(new TextEncoder().encode(wrongSecret));

      await expectAppErr(
        tokenService.verifyAccessToken(token),
        ErrCode.Unauthorized,
      );
    });

    it("should throw Unauthorized for a malformed token", async () => {
      await expectAppErr(
        tokenService.verifyAccessToken("not.a.jwt.token"),
        ErrCode.Unauthorized,
      );
    });

    it("should throw Unauthorized when tokenType is not 'access'", async () => {
      const token = await new SignJWT({
        ...mockPayload,
        tokenType: "refresh",
      })
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setSubject(mockPayload.userId)
        .setIssuer(mockEnv.JWT_ISSUER)
        .setAudience(mockEnv.JWT_AUDIENCE)
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(new TextEncoder().encode(mockEnv.JWT_ACCESS_TOKEN_SECRET));

      await expectAppErr(
        tokenService.verifyAccessToken(token),
        ErrCode.Unauthorized,
      );
    });

    it("should throw Unauthorized when userId is missing", async () => {
      const token = await new SignJWT({
        userAddress: mockPayload.userAddress,
        chainId: mockPayload.chainId,
        sessionId: mockPayload.sessionId,
        tokenType: "access",
      })
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setSubject(mockPayload.userId)
        .setIssuer(mockEnv.JWT_ISSUER)
        .setAudience(mockEnv.JWT_AUDIENCE)
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(new TextEncoder().encode(mockEnv.JWT_ACCESS_TOKEN_SECRET));

      await expectAppErr(
        tokenService.verifyAccessToken(token),
        ErrCode.Unauthorized,
      );
    });

    it("should throw Unauthorized when userAddress is missing", async () => {
      const token = await new SignJWT({
        userId: mockPayload.userId,
        chainId: mockPayload.chainId,
        sessionId: mockPayload.sessionId,
        tokenType: "access",
      })
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setSubject(mockPayload.userId)
        .setIssuer(mockEnv.JWT_ISSUER)
        .setAudience(mockEnv.JWT_AUDIENCE)
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(new TextEncoder().encode(mockEnv.JWT_ACCESS_TOKEN_SECRET));

      await expectAppErr(
        tokenService.verifyAccessToken(token),
        ErrCode.Unauthorized,
      );
    });
  });
});
