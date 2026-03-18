import type { Logger } from "@logtape/logtape";
import { chainIds, ProtocolContract } from "src/shared/constants/blockchain.js";
import type { DatabaseClient } from "src/shared/infra/index.js";
import type { IdUtils } from "src/shared/utils/id.js";
import { WSEvent } from "../../shared/ws/ws.types.js";
import type { WsEventPublisher } from "../../shared/ws/ws-publisher.js";
import type { BlockchainConfig } from "./index.js";

export function createLiquidatableUsersService(deps: {
  logger: Logger;
  dbClient: DatabaseClient;
  blcConfig: BlockchainConfig;
  wsPublisher: WsEventPublisher;
  idUtils: IdUtils;
}) {
  const { logger, wsPublisher, dbClient, blcConfig, idUtils } = deps;
  const provider = blcConfig.getProvider(chainIds.sepolia);
  const liquidationContract = blcConfig.getProtocolContract(
    ProtocolContract.Liquidation,
    chainIds.sepolia,
  );

  async function calculateLiquidatableUsers() {
    const blockNumber = await provider.getBlockNumber();
    const block = await provider.getBlock(blockNumber);
    const blockTimestamp = block.timestamp;
    try {
      const allUsers = await dbClient.userAsset.findAll();
      const activeUsers = allUsers.filter(
        (ua) => BigInt(ua.borrowedAmount) > 0n,
      );
      const activeUserIds = [...new Set(activeUsers.map((ua) => ua.userId))];

      logger.info("Checking liquidatable status for {count} active users", {
        count: activeUserIds.length,
      });

      // Get current liquidatable users from database
      const existingLiquidatable = await dbClient.liquidatableUser.findAll();
      const existingUserIds = new Set(
        existingLiquidatable.map((u) => u.userId),
      );

      const currentLiquidatableUserIds = [];

      // Check each active user
      for (const userId of activeUserIds) {
        try {
          const isLiquidatable =
            await liquidationContract.isAccountLiquidatable(userId);

          if (isLiquidatable) {
            currentLiquidatableUserIds.push(userId);

            // Only add if not already in database
            if (!existingUserIds.has(userId)) {
              await dbClient.liquidatableUser.create({
                id: idUtils.generateId(),
                userId,
              });
              logger.info("User marked liquidatable: {userId}", {
                userId: userId,
              });
            }
          } else {
            // User is no longer liquidatable, remove if exists
            if (existingUserIds.has(userId)) {
              await dbClient.liquidatableUser.destroy({
                where: {
                  userId: userId,
                },
              });
              logger.info("User unmarked liquidatable (recovered): {userId}", {
                userId: userId,
              });
            }
          }
        } catch (error) {
          logger.warn("Failed to check liquidatability for {userId}: {error}", {
            userId: userId,
            error,
          });
        }
      }

      // Remove users that are no longer active (fully repaid/withdrawn)
      const currentActiveSet = new Set(activeUserIds);
      for (const existingUser of existingLiquidatable) {
        if (!currentActiveSet.has(existingUser.userId)) {
          await dbClient.liquidatableUser.destroy({
            where: {
              userId: existingUser.userId,
            },
          });
          logger.info(
            "User removed from liquidatable (fully repaid/withdrawn): {userId}",
            { userId: existingUser.userId },
          );
        }
      }

      logger.info("Liquidatable users calculation completed: {count} users", {
        count: currentLiquidatableUserIds.length,
      });

      // Publish WebSocket event if publisher is available
      if (wsPublisher) {
        await wsPublisher.publish(WSEvent.LiquidatableUsersUpdated, {
          users: currentLiquidatableUserIds.map((userId) => ({ userId })),
          blockNumber: blockNumber || 0,
          timestamp: blockTimestamp || new Date(),
        });
      }

      return currentLiquidatableUserIds;
    } catch (error) {
      logger.error("Error calculating liquidatable users: {error}", { error });
      throw error;
    }
  }

  return {
    calculateLiquidatableUsers,
  };
}

export type LiquidatableUsersService = ReturnType<
  typeof createLiquidatableUsersService
>;
