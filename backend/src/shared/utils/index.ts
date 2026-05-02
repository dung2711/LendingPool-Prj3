export * from "./chart-query";
export * from "./id";
export * from "./log-retraction";
export * from "./rabbitmq-helpers.service";
export * from "./validate";

export function getUserAssetSyncRedisKey(params: {
  userId: bigint;
  assetId: bigint;
}) {
  const { userId, assetId } = params;
  return `blc:user-asset-sync:${userId}:${assetId}`;
}

export function getClientIp(
  headers: Record<string, string | undefined>,
): string {
  const forwarded = headers["x-forwarded-for"];
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }
  return headers["x-real-ip"] ?? "unknown";
}

export function getUserAgent(
  headers: Record<string, string | undefined>,
): string {
  return headers["user-agent"] ?? "unknown";
}
