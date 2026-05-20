import { vi } from "vitest";

export type MockProvider = {
  getBlockNumber: ReturnType<typeof vi.fn>;
  getBlock: ReturnType<typeof vi.fn>;
};

export type MockContract = {
  [key: string]: ReturnType<typeof vi.fn>;
};

export type MockBlockchainConfig = {
  getProvider: ReturnType<typeof vi.fn>;
  getProtocolContract: ReturnType<typeof vi.fn>;
  getERC20Contract: ReturnType<typeof vi.fn>;
};

export function createMockProvider(
  overrides?: Partial<MockProvider>,
): MockProvider {
  const base: MockProvider = {
    getBlockNumber: vi.fn(async () => 1000),
    getBlock: vi.fn(async () => ({
      number: 1000,
      timestamp: Math.floor(Date.now() / 1000),
    })),
  };

  return { ...base, ...(overrides ?? {}) };
}

export function createMockContract(
  methods: Record<string, unknown> = {},
): MockContract {
  const base: MockContract = {};
  for (const [key, value] of Object.entries(methods)) {
    base[key] = vi.fn(
      typeof value === "function"
        ? (value as (...args: unknown[]) => unknown)
        : async () => value,
    );
  }
  return base;
}

export function createMockERC20(overrides?: {
  name?: string;
  symbol?: string;
  decimals?: number;
}): MockContract {
  return createMockContract({
    name: overrides?.name ?? "Mock Token",
    symbol: overrides?.symbol ?? "MOCK",
    decimals: BigInt(overrides?.decimals ?? 18),
  });
}

export function createMockBlcConfig(
  overrides?: Partial<MockBlockchainConfig>,
): MockBlockchainConfig {
  const base: MockBlockchainConfig = {
    getProvider: vi.fn(() => createMockProvider()),
    getProtocolContract: vi.fn(() =>
      createMockContract({
        userBalances: { deposited: 0n, borrowed: 0n },
        getPrice: 1000000n,
        collateralFactor: 750000n,
        closeFactor: 500000n,
        liquidationIncentive: 1080000n,
        liquidationThreshold: 800000n,
        isAccountLiquidatable: false,
        getMarketRates: [0n, 0n, 0n],
        getAccountSnapshot: [0n, 0n, 0n, 0n],
      }),
    ),
    getERC20Contract: vi.fn(() => createMockERC20()),
  };

  return { ...base, ...(overrides ?? {}) };
}
