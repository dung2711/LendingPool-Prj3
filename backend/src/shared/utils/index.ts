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
