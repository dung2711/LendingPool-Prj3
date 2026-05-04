import type { Logger } from "@logtape/logtape";
import dayjs from "dayjs";
import type Redis from "ioredis";
import { Op, type Sequelize } from "sequelize";
import type { BlockchainEnv } from "src/shared/config";
import { ProtocolContract } from "src/shared/constants";
import type { DatabaseClient } from "src/shared/infra";
import type { ChainId } from "src/shared/types";
import {
  getReorgLockRedisKey,
  getUserAssetSyncRedisKey,
} from "src/shared/utils";
import type { BlockchainConfig } from "../blockchain.config";

enum CompareMatchResult {
  Match = "match",
  NotMatch = "not_match",
}

enum CompareNotMatchReason {
  NotFound = "not_found",
  HashMismatch = "hash_mismatch",
}

type CompareResultDetails = {
  [CompareMatchResult.Match]: {
    blockNumber: bigint;
  };
  [CompareMatchResult.NotMatch]: {
    reason: CompareNotMatchReason;
  };
};

type CompareResultPayload<T extends CompareMatchResult = CompareMatchResult> = {
  match: T;
  result: CompareResultDetails[T];
};

type CompareResult = {
  [K in CompareMatchResult]: CompareResultPayload<K>;
}[CompareMatchResult];

export function createBLCReorgService(deps: {
  blcConfig: BlockchainConfig;
  dbClient: DatabaseClient;
  sequelize: Sequelize;
  env: BlockchainEnv;
  redisClient: Redis;
  logger: Logger;
}) {
  const { blcConfig, dbClient, env, redisClient, sequelize, logger } = deps;

  async function setReorgLock(chainId: ChainId, forkPoint: number) {
    const key = getReorgLockRedisKey(chainId);
    const payload = {
      forkPoint,
      startedAt: Date.now(),
    };

    try {
      await redisClient.set(key, JSON.stringify(payload));
    } catch (error) {
      logger.warn("Failed to set reorg lock", {
        chainId,
        forkPoint,
        error: (error as Error).message,
      });
    }
  }

  async function detectReorg(
    chainId: ChainId,
    fromBlock: number,
  ): Promise<boolean> {
    const result = await compareBlocks(chainId, BigInt(fromBlock - 1));
    if (result.match === CompareMatchResult.Match) return false;
    return result.result.reason === CompareNotMatchReason.HashMismatch;
  }

  async function findForkPoint(
    chainId: ChainId,
    fromBlock: number,
  ): Promise<number> {
    const maxReorgLookback = env.MAX_BLOCK_LOOKBACK;
    const startBlock = fromBlock - 1;

    for (
      let block = startBlock;
      block >= Math.max(startBlock - maxReorgLookback, 0);
      block--
    ) {
      const result = await compareBlocks(chainId, BigInt(block));
      if (result.match === CompareMatchResult.Match) return block;
    }

    return Math.max(startBlock - maxReorgLookback, 0);
  }

  async function compareBlocks(
    chainId: ChainId,
    blockNumber: bigint,
  ): Promise<CompareResult> {
    const provider = blcConfig.getProvider(chainId);
    const [savedBlock, onChainBlock] = await Promise.all([
      dbClient.block.findOne({
        where: {
          chainId,
          number: blockNumber,
          isCanonical: true,
        },
      }),
      provider.getBlock(blockNumber),
    ]);

    if (!savedBlock || !onChainBlock) {
      return {
        match: CompareMatchResult.NotMatch,
        result: { reason: CompareNotMatchReason.NotFound },
      };
    }

    if (savedBlock.hash !== onChainBlock.hash) {
      return {
        match: CompareMatchResult.NotMatch,
        result: { reason: CompareNotMatchReason.HashMismatch },
      };
    }

    return {
      match: CompareMatchResult.Match,
      result: { blockNumber },
    };
  }

  async function handleReorg(chainId: ChainId, forkPoint: number) {
    const lendingPool = blcConfig.getProtocolContract(
      ProtocolContract.LendingPool,
      chainId,
    );
    const liquidation = blcConfig.getProtocolContract(
      ProtocolContract.Liquidation,
      chainId,
    );

    try {
      await setReorgLock(chainId, forkPoint);

      await sequelize.transaction(async (tx) => {
        await dbClient.block.update(
          { isCanonical: false },
          {
            where: {
              chainId,
              number: {
                [Op.gt]: forkPoint,
              },
            },
            transaction: tx,
          },
        );

        const assets = await dbClient.asset.findAll({
          where: { chainId },
          attributes: ["id"],
          transaction: tx,
        });
        const assetIds = assets.map((asset) => asset.id);

        if (assetIds.length > 0) {
          await Promise.all([
            dbClient.accrueLog.destroy({
              where: {
                blockNumber: { [Op.gt]: BigInt(forkPoint) },
                assetId: { [Op.in]: assetIds },
              },
              transaction: tx,
            }),
            dbClient.treasuryLog.destroy({
              where: {
                blockNumber: { [Op.gt]: BigInt(forkPoint) },
                assetId: { [Op.in]: assetIds },
              },
              transaction: tx,
            }),
            dbClient.transaction.destroy({
              where: {
                blockNumber: { [Op.gt]: BigInt(forkPoint) },
                assetId: { [Op.in]: assetIds },
              },
              transaction: tx,
            }),
          ]);
        }

        const affectedUserAssets = await dbClient.userAsset.findAll({
          where: {
            lastSyncedBlock: { [Op.gt]: BigInt(forkPoint) },
          },
          transaction: tx,
        });

        await Promise.all(
          affectedUserAssets.map(async (ua) => {
            const [user, asset] = await Promise.all([
              dbClient.user.findByPk(ua.userId),
              dbClient.asset.findByPk(ua.assetId),
            ]);

            if (!user || !asset) return;

            const balance = await lendingPool.userBalances(
              user.userAddress,
              asset.assetAddress,
              { blockTag: forkPoint },
            );

            await dbClient.userAsset.update(
              {
                depositedAmount: balance.deposited.toString(),
                borrowedAmount: balance.borrowed.toString(),
                lastSyncedBlock: BigInt(forkPoint),
                lastSyncedLogIndex: 0,
              },
              {
                where: {
                  userId: ua.userId,
                  assetId: ua.assetId,
                },
                transaction: tx,
              },
            );

            // Invalidate redis cursor for this user-asset pair after transaction commits
            const redisKey = getUserAssetSyncRedisKey({
              userId: ua.userId,
              assetId: ua.assetId,
            });
            tx.afterCommit(() => void redisClient.del(redisKey));
          }),
        );

        const affectedAssetIds = [
          ...new Set(affectedUserAssets.map((ua) => ua.assetId)),
        ];

        await Promise.all(
          affectedAssetIds.map(async (assetId) => {
            const asset = await dbClient.asset.findByPk(assetId, {
              transaction: tx,
            });
            if (!asset) return;

            const [market, treasuryBalance] = await Promise.all([
              lendingPool.markets(asset.assetAddress, { blockTag: forkPoint }),
              lendingPool.treasuryBalances(asset.assetAddress, {
                blockTag: forkPoint,
              }),
            ]);

            await dbClient.asset.update(
              {
                totalDeposited: market.totalDeposits.toString(),
                totalBorrowed: market.totalBorrows.toString(),
                treasuryBalance: treasuryBalance.toString(),
              },
              {
                where: { id: assetId },
                transaction: tx,
              },
            );
          }),
        );

        const [
          collateralFactor,
          liquidationThreshold,
          closeFactor,
          liquidationIncentive,
        ] = await Promise.all([
          lendingPool.collateralFactor({ blockTag: forkPoint }),
          liquidation.liquidationThreshold({ blockTag: forkPoint }),
          liquidation.closeFactor({ blockTag: forkPoint }),
          liquidation.liquidationIncentive({ blockTag: forkPoint }),
        ]);

        await dbClient.assetConfig.update(
          {
            collateralFactor: collateralFactor.toString(),
            liquidationThreshold: liquidationThreshold.toString(),
            closeFactor: closeFactor.toString(),
            liquidationIncentive: liquidationIncentive.toString(),
          },
          {
            where: {},
            transaction: tx,
          },
        );

        await dbClient.scanner.update(
          {
            lastScannedBlock: BigInt(forkPoint),
            lastScannedAt: dayjs().toDate(),
          },
          {
            where: { chainId },
            transaction: tx,
          },
        );
      });
    } catch (error) {
      logger.error("Error occurred while handling reorg", {
        forkPoint,
        chainId,
        error,
      });

      throw error;
    }
  }

  return {
    handleReorg,
    detectReorg,
    findForkPoint,
  };
}

export type BLCReorgService = ReturnType<typeof createBLCReorgService>;
