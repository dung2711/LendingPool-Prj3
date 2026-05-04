import type { Logger } from "@logtape/logtape";
import dayjs from "dayjs";
import type { EventLog, ethers } from "ethers";
import type Redis from "ioredis";
import type { Sequelize, Transaction } from "sequelize";
import type { BlockchainEnv } from "src/shared/config";
import {
  chainIds,
  ProtocolContract,
  protocolEventHandlers,
} from "src/shared/constants";
import type { DatabaseClient } from "src/shared/infra";
import type { ChainId } from "src/shared/types";
import { getReorgLockRedisKey } from "src/shared/utils";
import type { BlockchainConfig } from "../blockchain.config";
import type { IScanContract } from "../blockchain.types";
import type { BLCReorgService } from "./blc-reorg.service";
import type { BlockchainService } from "./blockchain.service";

export function createBLCIndexerService(deps: {
  blcConfig: BlockchainConfig;
  blcService: BlockchainService;
  blcReorgService: BLCReorgService;
  logger: Logger;
  dbClient: DatabaseClient;
  sequelize: Sequelize;
  env: BlockchainEnv;
  redisClient: Redis;
}) {
  const {
    blcConfig,
    logger,
    dbClient,
    blcService,
    sequelize,
    env,
    blcReorgService,
    redisClient,
  } = deps;

  async function clearReorgLockIfCaughtUp(params: {
    chainId: ChainId;
    toBlock: number;
  }) {
    const { chainId, toBlock } = params;
    const redisKey = getReorgLockRedisKey(chainId);

    try {
      const cached = await redisClient.get(redisKey);
      if (!cached) return;

      const parsed = JSON.parse(cached) as { forkPoint?: number };
      const forkPoint = Number(parsed.forkPoint);
      if (!Number.isFinite(forkPoint)) return;

      if (toBlock >= forkPoint) {
        await redisClient.del(redisKey);
        logger.info("Cleared reorg lock after rescan", {
          chainId,
          forkPoint,
          toBlock,
        });
      }
    } catch (error) {
      logger.warn("Failed to clear reorg lock", {
        chainId,
        toBlock,
        error: (error as Error).message,
      });
    }
  }

  async function initializeScannerState() {
    const chains = Object.values(chainIds);
    logger.info("Initializing scanner states", {
      chainCount: chains.length,
    });

    await Promise.all(
      chains.map(async (chainId) => {
        try {
          const currentBlock = await blcConfig
            .getProvider(chainId)
            .getBlockNumber();

          const [state] = await dbClient.scanner.findOrCreate({
            where: { chainId },
            defaults: {
              chainId,
              lastScannedBlock: BigInt(Math.max(currentBlock - 10, 0)),
              lastScannedAt: dayjs().toDate(),
              createdAt: dayjs().toDate(),
            },
          });

          logger.info("Initialized scanner state for chain {chainId}", {
            chainId,
            lastScannedBlock: state.lastScannedBlock,
          });
        } catch (error) {
          logger.error(
            "Failed to initialize scanner state for chain {chainId}: {error}",
            {
              chainId,
              error: (error as Error).message,
            },
          );
        }
      }),
    );
  }

  async function scanLendingPoolContract(params: IScanContract) {
    await scanContractEvents({
      ...params,
      contractName: ProtocolContract.LendingPool,
      label: "lending pool",
    });
  }

  async function scanLiquidationContract(params: IScanContract) {
    await scanContractEvents({
      ...params,
      contractName: ProtocolContract.Liquidation,
      label: "liquidation",
    });
  }

  async function scanContractEvents(
    params: IScanContract & {
      contractName: ProtocolContract;
      label: string;
    },
  ) {
    const { chainId, fromBlock, toBlock, contractName, label } = params;

    logger.info("Scanning {label} contract", {
      label,
      contractName,
      chainId,
      fromBlock,
      toBlock,
    });

    try {
      const contract = blcConfig.getProtocolContract(contractName, chainId);
      const events = await contract.queryFilter("*", fromBlock, toBlock);

      const parsedEvents = events.filter(
        (event): event is EventLog => "eventName" in event,
      );

      await Promise.all(
        parsedEvents.map(async (event) => {
          const handlerName =
            protocolEventHandlers[
              event.eventName as keyof typeof protocolEventHandlers
            ];

          if (!handlerName) {
            logger.debug("No handler mapped for event, skipped", {
              eventName: event.eventName,
              chainId,
              blockNumber: event.blockNumber,
            });
            return;
          }

          const serviceHandlers = blcService as unknown as Record<
            string,
            | ((args: { chainId: ChainId; event: EventLog }) => Promise<void>)
            | undefined
          >;

          const handler = serviceHandlers[handlerName];

          if (!handler) {
            logger.warn("Mapped handler is not implemented, skipped", {
              eventName: event.eventName,
              handlerName,
              chainId,
            });
            return;
          }

          await handler({
            chainId,
            event,
          });
        }),
      );

      logger.info("Finished scanning {label} contract", {
        label,
        contractName,
        chainId,
        fromBlock,
        toBlock,
        eventCount: parsedEvents.length,
      });
    } catch (error) {
      logger.error("Failed to scan {label} contract", {
        label,
        contractName,
        chainId,
        fromBlock,
        toBlock,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  async function scanTimelockContract(params: IScanContract) {
    const { chainId, fromBlock, toBlock } = params;

    try {
      const timelockContract = blcConfig.getProtocolContract(
        ProtocolContract.Timelock,
        chainId,
      );

      logger.info("Scanning timelock contract", {
        chainId,
        fromBlock,
        toBlock,
      });

      const events = await timelockContract.queryFilter(
        "*",
        fromBlock,
        toBlock,
      );
      const parsedEvents = events.filter(
        (event): event is EventLog => "eventName" in event,
      );

      await blcService.handleTimelockEvents({
        chainId,
        events: parsedEvents,
      });

      logger.info("Finished scanning timelock contract", {
        chainId,
        fromBlock,
        toBlock,
        eventCount: parsedEvents.length,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      logger.error("Failed to scan timelock contract", {
        chainId,
        fromBlock,
        toBlock,
        error: errorMessage,
      });
      throw error;
    }
  }

  async function scanChain(chainId: ChainId) {
    const startTime = dayjs().toDate();
    const scannerState = await dbClient.scanner.findOne({
      where: { chainId },
    });

    const fromBlock = scannerState
      ? Number(scannerState.lastScannedBlock) + 1
      : 0;

    if (fromBlock > 0) {
      const reorgDetected = await blcReorgService.detectReorg(
        chainId,
        fromBlock,
      );
      if (reorgDetected) {
        logger.warn("Reorg detected for chain {chainId} at block {fromBlock}", {
          chainId,
          fromBlock,
        });

        const forkPoint = await blcReorgService.findForkPoint(
          chainId,
          fromBlock,
        );

        await blcReorgService.handleReorg(chainId, forkPoint);

        logger.info(
          "Reorg handling completed, restarting scan from fork point",
          {
            chainId,
            forkPoint,
          },
        );

        return;
      }
    }

    const currentBlock = await blcConfig.getProvider(chainId).getBlockNumber();
    const toBlock = Math.min(currentBlock, fromBlock + env.MAX_BLOCK_RANGE - 1);

    if (fromBlock > currentBlock) {
      logger.info("Scanner is already up-to-date for chain", {
        chainId,
        currentBlock,
      });
      return;
    }

    await sequelize.transaction(async (tx) => {
      await Promise.all([
        scanLendingPoolContract({ chainId, fromBlock, toBlock }),
        scanLiquidationContract({ chainId, fromBlock, toBlock }),
        scanTimelockContract({ chainId, fromBlock, toBlock }),
      ]);

      await saveBlockHeaders(chainId, fromBlock, toBlock, tx);

      await dbClient.scanner.update(
        {
          lastScannedBlock: BigInt(toBlock),
          lastScannedAt: dayjs().toDate(),
        },
        {
          where: { chainId },
          transaction: tx,
        },
      );
    });

    await clearReorgLockIfCaughtUp({ chainId, toBlock });

    const endTime = dayjs().toDate();
    logger.info("Finished scanning chain", {
      chainId,
      fromBlock,
      toBlock,
      duration: endTime.getTime() - startTime.getTime(),
    });
  }

  async function saveBlockHeaders(
    chainId: ChainId,
    fromBlock: number,
    toBlock: number,
    tx: Transaction,
  ) {
    const provider = blcConfig.getProvider(chainId);
    const blockPromises: Promise<ethers.Block>[] = [];
    for (let blockNumber = fromBlock; blockNumber <= toBlock; blockNumber++) {
      blockPromises.push(provider.getBlock(blockNumber));
    }
    const blocks = await Promise.all(blockPromises);

    await Promise.all(
      blocks.map((block) =>
        dbClient.block.findOrCreate({
          where: {
            chainId,
            hash: block.hash!,
          },
          defaults: {
            number: BigInt(block.number),
            chainId,
            hash: block.hash!,
            parentHash: block.parentHash,
            isCanonical: true,
            indexedAt: dayjs().toDate(),
          },
          transaction: tx,
        }),
      ),
    );
  }

  return {
    initializeScannerState,
    scanChain,
  };
}
