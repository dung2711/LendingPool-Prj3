import type { IReqUser } from "src/shared/types";

// ── User fixtures ──────────────────────────────────────────────────────────

export function createReqUser(overrides: Partial<IReqUser> = {}): IReqUser {
  return {
    userId: overrides.userId ?? "1001",
    userAddress:
      overrides.userAddress ?? "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    chainId: overrides.chainId ?? "11155111",
    sessionId: overrides.sessionId ?? "session-1",
    ...overrides,
  };
}

// ── Sequelize row fixtures ─────────────────────────────────────────────────

export function createUserRow(overrides: Record<string, unknown> = {}) {
  return {
    id: BigInt(overrides.id ?? 1001),
    userAddress:
      overrides.userAddress ?? "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    chainId: overrides.chainId ?? 11155111,
    email: overrides.email ?? null,
    joinedAt: overrides.joinedAt ?? new Date("2026-01-01T00:00:00.000Z"),
    createdAt: overrides.createdAt ?? new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

export function createAssetRow(overrides: Record<string, unknown> = {}) {
  return {
    id: BigInt(overrides.id ?? 1),
    assetAddress:
      overrides.assetAddress ?? "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    chainId: overrides.chainId ?? 11155111,
    symbol: overrides.symbol ?? "USDC",
    name: overrides.name ?? "USD Coin",
    decimals: overrides.decimals ?? 6,
    isSupported: overrides.isSupported ?? true,
    totalDeposited: overrides.totalDeposited ?? "1000000",
    totalBorrowed: overrides.totalBorrowed ?? "500000",
    treasuryBalance: overrides.treasuryBalance ?? "10000",
    createdAt: overrides.createdAt ?? new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: overrides.updatedAt ?? new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

export function createSessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: overrides.id ?? "session-1",
    device: overrides.device ?? "test-agent",
    ip: overrides.ip ?? "127.0.0.1",
    token: overrides.token ?? "refresh-token-1",
    createdById: BigInt(overrides.createdById ?? 1001),
    expired:
      overrides.expired ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    revoked: overrides.revoked ?? false,
    createdAt: overrides.createdAt ?? new Date(),
    updatedAt: overrides.updatedAt ?? new Date(),
    ...overrides,
  };
}

export function createTransactionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: BigInt(overrides.id ?? 1),
    transactionHash:
      overrides.transactionHash ??
      "0xabc123def456789012345678901234567890abcdef1234567890abcdef123456",
    userId: BigInt(overrides.userId ?? 1001),
    assetId: BigInt(overrides.assetId ?? 1),
    type: overrides.type ?? "DEPOSIT",
    amount: overrides.amount ?? "1000000",
    amountUSD: overrides.amountUSD ?? "1000000",
    blockNumber: BigInt(overrides.blockNumber ?? 100),
    createdAt: overrides.createdAt ?? new Date("2026-04-15T00:00:00.000Z"),
    dataValues: overrides.dataValues ?? {
      assetAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    },
    ...overrides,
  };
}

export function createTransactionEventParams(
  overrides: Record<string, unknown> = {},
) {
  return {
    chainId: overrides.chainId ?? "11155111",
    userAddress:
      overrides.userAddress ?? "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    assetAddress:
      overrides.assetAddress ?? "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    amount: overrides.amount ?? "1000000",
    transactionHash:
      overrides.transactionHash ??
      "0xabc123def456789012345678901234567890abcdef1234567890abcdef123456",
    blockNumber: overrides.blockNumber ?? 100,
    logIndex: overrides.logIndex ?? 0,
    publishedAt: overrides.publishedAt ?? Date.now(),
    ...overrides,
  };
}
