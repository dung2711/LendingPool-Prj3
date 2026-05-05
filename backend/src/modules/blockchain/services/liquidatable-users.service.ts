import type { Logger } from "@logtape/logtape";
import { Op } from "sequelize";
import { ProtocolContract } from "src/shared/constants/blockchain.js";
import type { DatabaseClient } from "src/shared/infra/index.js";
import type { ChainId } from "src/shared/types/blockchain.js";
import type { IdUtils } from "src/shared/utils/id.js";
import { WSEvent } from "src/shared/ws/ws.types.js";
import type { WsEventPublisher } from "src/shared/ws/ws-publisher.js";
import type { BlockchainConfig } from "../index.js";

export function createLiquidatableUsersService(deps: {
  logger: Logger;
  dbClient: DatabaseClient;
  blcConfig: BlockchainConfig;
  wsPublisher: WsEventPublisher;
  idUtils: IdUtils;
}) {
  const { logger, wsPublisher, dbClient, blcConfig, idUtils } = deps;
  const LIQUIDATABLE_BATCH_SIZE = 100;

  async function calculateLiquidatableUsers(chainId: ChainId): Promise<void> {
    const provider = blcConfig.getProvider(chainId);
    const liquidationContract = blcConfig.getProtocolContract(
      ProtocolContract.Liquidation,
      chainId,
    );

    const blockNumber = await provider.getBlockNumber();
    const block = await provider.getBlock(blockNumber);
    const blockTimestamp = block.timestamp;

    logger.info(
      "Starting liquidatable-user scan for chainId {chainId} at block {blockNumber}",
      { chainId, blockNumber },
    );

    const currentLiquidatableAddresses: string[] = [];

    // Cursor-paginated scan over users with an active borrow on this chain.
    // We paginate by userId (bigint cursor) to avoid loading all rows at once.
    let cursor = 0n;

    while (true) {
      // Fetch the next page of unique userIds with borrowedAmount > 0
      // on this chain (joined through the asset table for the chain filter).
      const batch = await dbClient.userAsset.findAll({
        where: {
          borrowedAmount: { [Op.gt]: "0" },
          userId: { [Op.gt]: cursor },
        },
        include: [
          {
            model: dbClient.asset,
            where: { chainId },
            required: true,
            attributes: [],
          },
        ],
        attributes: ["userId"],
        order: [["userId", "ASC"]],
        limit: LIQUIDATABLE_BATCH_SIZE,
      });

      if (batch.length === 0) break;

      // Deduplicate userIds within this page (one user may borrow multiple assets).
      const userIds = [...new Set(batch.map((ua) => ua.userId))];

      // Fetch wallet addresses for this batch.
      const users = await dbClient.user.findAll({
        where: { id: { [Op.in]: userIds } },
        attributes: ["id", "userAddress"],
      });
      const userAddressMap = new Map(users.map((u) => [u.id, u.userAddress]));

      for (const userId of userIds) {
        const userAddress = userAddressMap.get(userId);
        if (!userAddress) {
          logger.warn(
            "Skip liquidatable check: user not found for userId {userId}",
            { userId },
          );
          continue;
        }

        try {
          const isLiquidatable =
            await liquidationContract.isAccountLiquidatable(userAddress);

          if (isLiquidatable) {
            currentLiquidatableAddresses.push(userAddress);

            await dbClient.liquidatableUser.findOrCreate({
              where: { userId },
              defaults: {
                id: idUtils.generateId(),
                userId,
              },
            });
            logger.info("User marked liquidatable: {userId}", { userId });
          } else {
            await dbClient.liquidatableUser.destroy({ where: { userId } });
          }
        } catch (error) {
          logger.warn("Failed to check liquidatability for {userId}: {error}", {
            userId,
            error,
          });
        }
      }

      // Advance cursor to the last userId in this page.
      cursor = userIds[userIds.length - 1];

      if (batch.length < LIQUIDATABLE_BATCH_SIZE) break;
    }

    // Cleanup: remove liquidatableUser records for users who no longer
    // have any active borrow on this chain (fully repaid / withdrawn).
    await dbClient.liquidatableUser.destroy({
      where: {
        userId: {
          [Op.notIn]: await dbClient.userAsset
            .findAll({
              where: { borrowedAmount: { [Op.gt]: "0" } },
              include: [
                {
                  model: dbClient.asset,
                  where: { chainId },
                  required: true,
                  attributes: [],
                },
              ],
              attributes: ["userId"],
            })
            .then((rows) => [...new Set(rows.map((r) => r.userId))]),
        },
      },
    });

    logger.info(
      "Liquidatable-user scan completed for chainId {chainId}: {count} liquidatable user(s)",
      { chainId, count: currentLiquidatableAddresses.length },
    );

    // Publish WebSocket event with the current liquidatable set.
    await wsPublisher.publish(WSEvent.LiquidatableUsersUpdated, {
      users: currentLiquidatableAddresses.map((address) => ({ address })),
      blockNumber,
      // blockTimestamp is Unix seconds; convert to ms for JS Date consumers.
      timestamp: blockTimestamp * 1000,
    });
  }

  return {
    calculateLiquidatableUsers,
  };
}

export type LiquidatableUsersService = ReturnType<
  typeof createLiquidatableUsersService
>;
