import type { Logger } from "@logtape/logtape";
import { ethers } from "ethers";
import type { BlockchainEnv } from "../../shared/config";
import {
  chainIds,
  erc20ABI,
  ProtocolContract,
  protocolContractABIs,
} from "../../shared/constants";
import type {
  BlockchainContractAddresses,
  BlockchainContracts,
  BlockchainProviders,
  ChainId,
} from "../../shared/types";

type SupportedProtocolContract = keyof typeof protocolContractABIs;

function toAddressMap(
  entries: Array<[ProtocolContract, string | undefined]>,
): Partial<Record<ProtocolContract, string>> {
  const addressMap: Partial<Record<ProtocolContract, string>> = {};

  for (const [contractName, address] of entries) {
    if (!address) continue;
    addressMap[contractName] = address;
  }

  return addressMap;
}

export function createBlockchainProviders(deps: {
  env: Pick<BlockchainEnv, "ETHEREUM_RPC_URL" | "BSC_RPC_URL">;
}): BlockchainProviders {
  const { env } = deps;

  const providers: BlockchainProviders = {
    [chainIds.sepolia]: new ethers.JsonRpcProvider(env.ETHEREUM_RPC_URL),
  };

  if (env.BSC_RPC_URL) {
    providers[chainIds.bscTestnet] = new ethers.JsonRpcProvider(
      env.BSC_RPC_URL,
    );
  }

  return providers;
}

export function createBlockchainContractAddresses(
  env: BlockchainEnv,
): BlockchainContractAddresses {
  return {
    [chainIds.sepolia]: toAddressMap([
      [ProtocolContract.LendingPool, env.SEPOLIA_LENDING_POOL_ADDRESS],
      [
        ProtocolContract.InterestRateModel,
        env.SEPOLIA_INTEREST_RATE_MODEL_ADDRESS,
      ],
      [ProtocolContract.MyOracle, env.SEPOLIA_MY_ORACLE_ADDRESS],
      [ProtocolContract.Liquidation, env.SEPOLIA_LIQUIDATION_ADDRESS],
      [ProtocolContract.PriceRouter, env.SEPOLIA_PRICE_ROUTER_ADDRESS],
    ]),
    [chainIds.bscTestnet]: toAddressMap([
      [ProtocolContract.LendingPool, env.BSC_TESTNET_LENDING_POOL_ADDRESS],
      [
        ProtocolContract.InterestRateModel,
        env.BSC_TESTNET_INTEREST_RATE_MODEL_ADDRESS,
      ],
      [ProtocolContract.MyOracle, env.BSC_TESTNET_MY_ORACLE_ADDRESS],
      [ProtocolContract.Liquidation, env.BSC_TESTNET_LIQUIDATION_ADDRESS],
      [ProtocolContract.PriceRouter, env.BSC_TESTNET_PRICE_ROUTER_ADDRESS],
    ]),
  };
}

export function createBlockchainContracts(deps: {
  providers: BlockchainProviders;
  contractAddresses: BlockchainContractAddresses;
  logger: Logger;
}): BlockchainContracts {
  const { providers, contractAddresses, logger } = deps;
  const contracts: BlockchainContracts = {};

  const contractNames = Object.keys(
    protocolContractABIs,
  ) as SupportedProtocolContract[];

  for (const contractName of contractNames) {
    const sepoliaProvider = providers[chainIds.sepolia];
    const sepoliaAddress = contractAddresses[chainIds.sepolia]?.[contractName];
    if (sepoliaAddress && sepoliaProvider) {
      contracts[chainIds.sepolia] ??= {};
      contracts[chainIds.sepolia]![contractName] = new ethers.Contract(
        sepoliaAddress,
        protocolContractABIs[contractName],
        sepoliaProvider,
      );
    } else {
      logger.warn("Skipped contract setup on sepolia due to missing config", {
        contractName,
        hasAddress: Boolean(sepoliaAddress),
        hasProvider: Boolean(sepoliaProvider),
      });
    }

    const bscProvider = providers[chainIds.bscTestnet];
    const bscAddress = contractAddresses[chainIds.bscTestnet]?.[contractName];
    if (bscAddress && bscProvider) {
      contracts[chainIds.bscTestnet] ??= {};
      contracts[chainIds.bscTestnet]![contractName] = new ethers.Contract(
        bscAddress,
        protocolContractABIs[contractName],
        bscProvider,
      );
    } else {
      logger.warn(
        "Skipped contract setup on bscTestnet due to missing config",
        {
          contractName,
          hasAddress: Boolean(bscAddress),
          hasProvider: Boolean(bscProvider),
        },
      );
    }
  }

  return contracts;
}

export function createBlockchainConfig(deps: {
  env: BlockchainEnv;
  logger: Logger;
}) {
  const { env, logger } = deps;

  const providers = createBlockchainProviders({ env });
  const contractAddresses = createBlockchainContractAddresses(env);
  const contracts = createBlockchainContracts({
    providers,
    contractAddresses,
    logger,
  });

  function getProvider(chainId: ChainId): ethers.JsonRpcProvider {
    const provider = providers[chainId];

    if (!provider) {
      throw new Error(`Provider is not configured for chain ID: ${chainId}`);
    }

    return provider;
  }

  function getProtocolContract(
    contractName: ProtocolContract,
    chainId: ChainId,
  ): ethers.Contract {
    const contract = contracts[chainId]?.[contractName];

    if (!contract) {
      throw new Error(
        `Contract ${contractName} is not configured on chain ID: ${chainId}`,
      );
    }

    return contract;
  }

  function getERC20Contract(
    tokenAddress: string,
    chainId: ChainId,
  ): ethers.Contract {
    const provider = getProvider(chainId);
    return new ethers.Contract(tokenAddress, erc20ABI, provider);
  }

  return {
    getProvider,
    getProtocolContract,
    getERC20Contract,
  };
}

export type BlockchainConfig = ReturnType<typeof createBlockchainConfig>;
