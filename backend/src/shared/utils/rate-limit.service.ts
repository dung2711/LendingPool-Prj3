import type { NextFunction, Request, Response } from "express";
import type Redis from "ioredis";
import { AppErr, ErrCode } from "../constants";

// ── Types ────────────────────────────────────────────────────────────────────

type CooldownOptions = {
  key: string;
  cooldownSeconds: number;
  message?: string;
};

type AttemptLimitOptions = {
  key: string;
  maxAttempts: number;
  cooldownSeconds: number;
  message?: string;
};

type IpRateLimitOptions = {
  limit?: number;
  windowMs?: number;
  keyPrefix?: string;
  message?: string;
};

const attemptLimitLua = `
    local key = KEYS[1]
    local ttl = tonumber(ARGV[1])
    local count = redis.call('INCR', key)
    if count == 1 then
        redis.call('EXPIRE', key, ttl)
    end
    return count
`;

/**
 * Sliding-window rate-limit script (sorted-set per IP).
 *
 * Algorithm (atomic):
 *   1. Drop entries older than `now - windowMs`.
 *   2. Count remaining entries.
 *   3. If count >= limit → return 0 (rejected).
 *   4. Otherwise add current timestamp and refresh TTL → return 1 (allowed).
 */
const slidingWindowLua = `
    local key    = KEYS[1]
    local now    = tonumber(ARGV[1])
    local window = tonumber(ARGV[2])
    local limit  = tonumber(ARGV[3])
    local ttlSec = tonumber(ARGV[4])
    local oldest = now - window

    redis.call('ZREMRANGEBYSCORE', key, '-inf', oldest)
    local count = tonumber(redis.call('ZCARD', key))

    if count >= limit then
        return 0
    end

    redis.call('ZADD', key, now, now)
    redis.call('EXPIRE', key, ttlSec)
    return 1
`;

export function createRateLimitService(deps: { redis: Redis }) {
  const { redis } = deps;

  function buildKey(key: string): string {
    return `rate_limit:${key}`;
  }

  async function ensureCooldown(options: CooldownOptions): Promise<void> {
    const { key, cooldownSeconds, message } = options;

    const cacheKey = buildKey(key);
    const result = await redis.call("SET", [
      cacheKey,
      String(Date.now()),
      "NX",
      "EX",
      String(cooldownSeconds),
    ]);

    if (result !== "OK") {
      throw new AppErr(ErrCode.RateLimitExceeded, {
        errors: message ?? "Too many requests. Please try again later.",
      });
    }
  }

  async function ensureAttemptLimit(options: AttemptLimitOptions) {
    const { key, maxAttempts, cooldownSeconds, message } = options;
    const cacheKey = buildKey(key);
    const count = Number(
      await redis.call(
        "EVAL",
        attemptLimitLua,
        1,
        cacheKey,
        String(cooldownSeconds),
      ),
    );
    if (count > maxAttempts) {
      throw new AppErr(ErrCode.RateLimitExceeded, {
        errors: message ?? "Too many attempts. Please try again later.",
      });
    }
  }

  return { ensureCooldown, ensureAttemptLimit };
}

export function createIpRateLimitMiddleware(deps: { redis: Redis }) {
  const { redis } = deps;

  return function ipRateLimit(options?: IpRateLimitOptions) {
    const {
      limit = 60,
      windowMs = 60_000,
      keyPrefix = "ip_rl",
      message = "Too many requests. Please slow down.",
    } = options ?? {};

    return async function ipRateLimitMiddleware(
      req: Request,
      res: Response,
      next: NextFunction,
    ): Promise<void> {
      try {
        const forwarded = req.headers["x-forwarded-for"];
        const ip =
          (Array.isArray(forwarded)
            ? forwarded[0]
            : forwarded?.split(",")[0]?.trim()) ??
          req.socket.remoteAddress ??
          "unknown";

        const key = `${keyPrefix}:${ip}`;
        const now = Date.now();
        const ttlSec = Math.ceil(windowMs / 1000);

        const allowed = await redis.eval(
          slidingWindowLua,
          1,
          key,
          String(now),
          String(windowMs),
          String(limit),
          String(ttlSec),
        );

        if (allowed === 0 || allowed === "0") {
          const remainingTtl = await redis.ttl(key);
          res.setHeader("Retry-After", String(remainingTtl));
          throw new AppErr(ErrCode.RateLimitExceeded, { errors: message });
        }

        next();
      } catch (err) {
        next(err);
      }
    };
  };
}

export type RateLimitService = ReturnType<typeof createRateLimitService>;
export type IpRateLimitMiddleware = ReturnType<
  typeof createIpRateLimitMiddleware
>;
