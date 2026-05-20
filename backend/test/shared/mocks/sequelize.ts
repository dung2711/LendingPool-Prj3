import { vi } from "vitest";

export type MockSequelizeTransaction = {
  LOCK: { UPDATE: string };
  afterCommit: ReturnType<typeof vi.fn>;
};

export type MockSequelize = {
  transaction: ReturnType<typeof vi.fn>;
};

/**
 * Creates a mock Sequelize instance whose `transaction()` method
 * immediately invokes the callback with a mock transaction object.
 */
export function createMockSequelize(
  overrides?: Partial<MockSequelize>,
): MockSequelize {
  const base: MockSequelize = {
    transaction: vi.fn(
      (cb: (t: MockSequelizeTransaction) => Promise<unknown>) => {
        const t: MockSequelizeTransaction = {
          LOCK: { UPDATE: "UPDATE" },
          afterCommit: vi.fn((fn: () => void) => fn()),
        };
        return cb(t);
      },
    ),
  };

  return { ...base, ...(overrides ?? {}) };
}
