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

      const [affectedUserAssets, assets] = await Promise.all([
        dbClient.userAsset.findAll({
          where: { lastSyncedBlock: { [Op.gt]: BigInt(forkPoint) } },
          include: [
            {
              model: dbClient.asset,
              where: { chainId },
              required: true,
              attributes: [],
            },
          ],
        }),
        dbClient.asset.findAll({
          where: { chainId },
          attributes: ["id", "assetAddress"],
        }),
      ]);

      const assetIds = assets.map((a) => a.id);
      const affectedAssetIds = [
        ...new Set(affectedUserAssets.map((ua) => ua.assetId)),
      ];

      const userAssetDetails = await Promise.all(
        affectedUserAssets.map(async (ua) => {
          const [user, asset] = await Promise.all([
            dbClient.user.findByPk(ua.userId),
            dbClient.asset.findByPk(ua.assetId),
          ]);
          return { ua, user, asset };
        }),
      );

      const [
        userBalances,
        assetMarkets,
        collateralFactor,
        liquidationThreshold,
        closeFactor,
        liquidationIncentive,
      ] = await Promise.all([
        Promise.all(
          userAssetDetails.map(({ user, asset }) => {
            if (!user || !asset) return Promise.resolve(null);
            return lendingPool.userBalances(
              user.userAddress,
              asset.assetAddress,
              { blockTag: forkPoint },
            );
          }),
        ),
        Promise.all(
          affectedAssetIds.map(async (assetId) => {
            const asset = assets.find((a) => a.id === assetId);
            if (!asset) return null;
            const [market, treasuryBalance] = await Promise.all([
              lendingPool.markets(asset.assetAddress, { blockTag: forkPoint }),
              lendingPool.treasuryBalances(asset.assetAddress, {
                blockTag: forkPoint,
              }),
            ]);
            return { assetId, market, treasuryBalance };
          }),
        ),
        lendingPool.collateralFactor({ blockTag: forkPoint }),
        liquidation.liquidationThreshold({ blockTag: forkPoint }),
        liquidation.closeFactor({ blockTag: forkPoint }),
        liquidation.liquidationIncentive({ blockTag: forkPoint }),
      ]);

      await sequelize.transaction(async (tx) => {
        await dbClient.block.update(
          { isCanonical: false },
          {
            where: { chainId, number: { [Op.gt]: forkPoint } },
            transaction: tx,
          },
        );

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

        await Promise.all(
          userAssetDetails.map(async ({ ua }, i) => {
            const balance = userBalances[i];
            if (!balance) return;

            await dbClient.userAsset.update(
              {
                depositedAmount: balance.deposited.toString(),
                borrowedAmount: balance.borrowed.toString(),
                lastSyncedBlock: BigInt(forkPoint),
                lastSyncedLogIndex: 0,
              },
              {
                where: { userId: ua.userId, assetId: ua.assetId },
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
        await Promise.all(
          assetMarkets.map(async (entry) => {
            if (!entry) return;
            const { assetId, market, treasuryBalance } = entry;
            await dbClient.asset.update(
              {
                totalDeposited: market.totalDeposits.toString(),
                totalBorrowed: market.totalBorrows.toString(),
                treasuryBalance: treasuryBalance.toString(),
              },
              { where: { id: assetId }, transaction: tx },
            );
          }),
        );

        await dbClient.assetConfig.update(
          {
            collateralFactor: collateralFactor.toString(),
            liquidationThreshold: liquidationThreshold.toString(),
            closeFactor: closeFactor.toString(),
            liquidationIncentive: liquidationIncentive.toString(),
          },
          { where: { chainId }, transaction: tx },
        );

        await dbClient.scanner.update(
          {
            lastScannedBlock: BigInt(forkPoint),
            lastScannedAt: dayjs().toDate(),
          },
          { where: { chainId }, transaction: tx },
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
