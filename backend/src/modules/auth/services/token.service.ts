import { type JWTPayload, jwtVerify, SignJWT } from "jose";
import type { BaseEnv } from "src/shared/config";
import { AppErr, ErrCode } from "src/shared/constants";
import type { IReqUser } from "src/shared/types";

interface AccessTokenJWTPayload extends JWTPayload, IReqUser {
  tokenType: "access";
}

export function createTokenService(deps: {
  env: Pick<
    BaseEnv,
    | "JWT_ACCESS_TOKEN_SECRET"
    | "JWT_ISSUER"
    | "JWT_AUDIENCE"
    | "JWT_ACCESS_TOKEN_TTL_SECONDS"
  >;
}) {
  const { env } = deps;

  function encodeSecret(secret: string): Uint8Array {
    return new TextEncoder().encode(secret);
  }

  function generateAccessToken(payload: IReqUser): Promise<string> {
    return new SignJWT({
      ...payload,
      tokenType: "access",
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(payload.userId)
      .setIssuer(env.JWT_ISSUER)
      .setAudience(env.JWT_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${env.JWT_ACCESS_TOKEN_TTL_SECONDS}s`)
      .sign(encodeSecret(env.JWT_ACCESS_TOKEN_SECRET));
  }

  async function verifyAccessToken(token: string): Promise<IReqUser> {
    try {
      const { payload } = await jwtVerify<AccessTokenJWTPayload>(
        token,
        encodeSecret(env.JWT_ACCESS_TOKEN_SECRET),
        {
          issuer: env.JWT_ISSUER,
          audience: env.JWT_AUDIENCE,
        },
      );

      if (
        payload.tokenType !== "access" ||
        !payload.userId ||
        !payload.userAddress ||
        !payload.chainId ||
        !payload.sessionId
      ) {
        throw new AppErr(ErrCode.Unauthorized, {
          errors: "Invalid access token payload",
        });
      }

      return {
        userId: payload.userId,
        userAddress: payload.userAddress,
        chainId: payload.chainId,
        sessionId: payload.sessionId,
      };
    } catch (error) {
      if (error instanceof AppErr) {
        throw error;
      }

      throw new AppErr(ErrCode.Unauthorized, {
        errors: "Invalid or expired access token",
      });
    }
  }

  return {
    generateAccessToken,
    verifyAccessToken,
  };
}

export type ITokenService = ReturnType<typeof createTokenService>;
