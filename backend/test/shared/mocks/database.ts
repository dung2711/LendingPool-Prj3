import { vi } from "vitest";

/**
 * Creates a mock Sequelize model with all standard query methods.
 * Each method is a vi.fn() that can be configured per-test via mockResolvedValue etc.
 */
function createMockModel() {
  return {
    findOne: vi.fn(async () => null),
    findAll: vi.fn(async () => []),
    findOrCreate: vi.fn(async () => [null, false] as const),
    create: vi.fn(async () => ({})),
    update: vi.fn(async () => [0] as const),
    destroy: vi.fn(async () => 0),
    bulkCreate: vi.fn(async () => []),
  };
}

export type MockModel = ReturnType<typeof createMockModel>;

export type MockDatabaseClient = {
  user: MockModel;
  asset: MockModel;
  assetConfig: MockModel;
  userAsset: MockModel;
  transaction: MockModel;
  session: MockModel;
  accrueLog: MockModel;
  treasuryLog: MockModel;
  block: MockModel;
  scanner: MockModel;
  assetSnapshot: MockModel;
  userSnapshot: MockModel;
  cronnerState: MockModel;
  liquidatableUser: MockModel;
  proposal: MockModel;
  $sequelize: { query: ReturnType<typeof vi.fn> };
};

export function createMockDbClient(
  overrides?: Partial<MockDatabaseClient>,
): MockDatabaseClient {
  const base: MockDatabaseClient = {
    user: createMockModel(),
    asset: createMockModel(),
    assetConfig: createMockModel(),
    userAsset: createMockModel(),
    transaction: createMockModel(),
    session: createMockModel(),
    accrueLog: createMockModel(),
    treasuryLog: createMockModel(),
    block: createMockModel(),
    scanner: createMockModel(),
    assetSnapshot: createMockModel(),
    userSnapshot: createMockModel(),
    cronnerState: createMockModel(),
    liquidatableUser: createMockModel(),
    proposal: createMockModel(),
    $sequelize: { query: vi.fn() },
  };

  return { ...base, ...(overrides ?? {}) };
}
