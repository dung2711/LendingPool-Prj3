import { vi } from "vitest";

export type MockRedis = {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
  call: ReturnType<typeof vi.fn>;
  eval: ReturnType<typeof vi.fn>;
  ttl: ReturnType<typeof vi.fn>;
};

export function createMockRedis(overrides?: Partial<MockRedis>): MockRedis {
  const base: MockRedis = {
    get: vi.fn(async () => null),
    set: vi.fn(async () => "OK"),
    del: vi.fn(async () => 1),
    call: vi.fn(async () => "OK"),
    eval: vi.fn(async () => 1),
    ttl: vi.fn(async () => 60),
  };

  return { ...base, ...(overrides ?? {}) };
}
