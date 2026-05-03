import type { CookieOptions } from "express";
import type { BaseEnv } from "src/shared/config";

export const ACCESS_TOKEN_COOKIE_NAME = "lp_access_token";
export const REFRESH_TOKEN_COOKIE_NAME = "lp_refresh_token";

export function getCookieValue(
  cookieHeader: string | undefined,
  cookieName: string,
): string | undefined {
  if (!cookieHeader) {
    return;
  }

  for (const entry of cookieHeader.split(";")) {
    const [rawName, ...rawValueParts] = entry.trim().split("=");
    if (rawName !== cookieName) {
      continue;
    }

    return decodeURIComponent(rawValueParts.join("="));
  }

  return;
}

export function createAuthCookieOptions(
  env: Pick<
    BaseEnv,
    | "NODE_ENV"
    | "JWT_ACCESS_TOKEN_TTL_SECONDS"
    | "JWT_REFRESH_TOKEN_TTL_SECONDS"
  >,
) {
  const baseOptions: CookieOptions = {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: env.NODE_ENV === "production" ? "none" : "strict",
    path: "/",
  };

  return {
    accessToken: {
      ...baseOptions,
      maxAge: env.JWT_ACCESS_TOKEN_TTL_SECONDS * 1000,
    } satisfies CookieOptions,
    refreshToken: {
      ...baseOptions,
      maxAge: env.JWT_REFRESH_TOKEN_TTL_SECONDS * 1000,
    } satisfies CookieOptions,
    clear: baseOptions,
  };
}

export type AuthCookieOptions = ReturnType<typeof createAuthCookieOptions>;
