import type { Logger } from "@logtape/logtape";
import dayjs from "dayjs";
import type { EventLog } from "ethers";
import type { BlockchainEnv } from "src/shared/config";
import {
  chainIds,
  ProtocolContract,
  protocolEventHandlers,
} from "src/shared/constants";
import type { DatabaseClient } from "src/shared/infra";
import type { ChainId } from "src/shared/types";
import type { BlockchainConfig } from "./blockchain.config";
import type { BlockchainService } from "./blockchain.service";
import type { IScanContract } from "./blockchain.types";

export function createBLCIndexerService(deps: {
  blcConfig: BlockchainConfig;
  blcService: BlockchainService;
  logger: Logger;
  dbClient: DatabaseClient;
  env: BlockchainEnv;
}) {
  const { blcConfig, logger, dbClient, blcService, env } = deps;

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
            where: { chainId: chainId.toString() },
            defaults: {
              chainId: chainId.toString(),
              lastScannedBlock: Math.max(currentBlock - 10, 0),
              lastScannedAt: dayjs().toDate(),
              createdAt: dayjs().toDate(),
            },
          });

          logger.info("Initialized scanner state for chain", {
            chainId,
            lastScannedBlock: state.lastScannedBlock,
          });
        } catch (error) {
          logger.error("Failed to initialize scanner state for chain", {
            chainId,
            error: (error as Error).message,
          });
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
    }
  }

  async function scanChain(chainId: ChainId) {
    const startTime = dayjs().toDate();
    const scannerState = await dbClient.scanner.findOne({
      where: { chainId: chainId.toString() },
    });

    const fromBlock = scannerState ? scannerState.lastScannedBlock + 1 : 0;
    const currentBlock = await blcConfig.getProvider(chainId).getBlockNumber();
    const toBlock = Math.min(currentBlock, fromBlock + env.MAX_BLOCK_RANGE - 1);

    if (fromBlock > currentBlock) {
      logger.info("Scanner is already up-to-date for chain", {
        chainId,
        currentBlock,
      });
      return;
    }

    await Promise.all([
      scanLendingPoolContract({ chainId, fromBlock, toBlock }),
      scanLiquidationContract({ chainId, fromBlock, toBlock }),
    ]);

    await dbClient.scanner.update(
      {
        lastScannedBlock: toBlock,
        lastScannedAt: dayjs().toDate(),
      },
      {
        where: { chainId: chainId.toString() },
      },
    );

    const endTime = dayjs().toDate();
    logger.info("Finished scanning chain", {
      chainId,
      fromBlock,
      toBlock,
      duration: endTime.getTime() - startTime.getTime(),
    });
  }

  return {
    initializeScannerState,
    scanLendingPoolContract,
    scanLiquidationContract,
    scanChain,
  };
}
