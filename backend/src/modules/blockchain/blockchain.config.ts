import type { Logger } from "@logtape/logtape";
import { ethers } from "ethers";
import type { BlockchainEnv } from "../../shared/config";
import {
  chainIds,
  ProtocolContract,
  protocolContractABIs,
} from "../../shared/constants";
import type {
  BlockchainContractAddresses,
  BlockchainContracts,
  BlockchainProviders,
  ChainId,
} from "../../shared/types";

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

  return {
    sepolia: new ethers.JsonRpcProvider(env.ETHEREUM_RPC_URL),
    bscTestnet: new ethers.JsonRpcProvider(env.BSC_RPC_URL),
  };
}

export function createBlockchainContractAddresses(
  env: BlockchainEnv,
): BlockchainContractAddresses {
  return {
    sepolia: toAddressMap([
      [ProtocolContract.LendingPool, env.SEPOLIA_LENDING_POOL_ADDRESS],
      [
        ProtocolContract.InterestRateModel,
        env.SEPOLIA_INTEREST_RATE_MODEL_ADDRESS,
      ],
      [ProtocolContract.MyOracle, env.SEPOLIA_MY_ORACLE_ADDRESS],
      [ProtocolContract.Liquidation, env.SEPOLIA_LIQUIDATION_ADDRESS],
      [ProtocolContract.PriceRouter, env.SEPOLIA_PRICE_ROUTER_ADDRESS],
    ]),
    bscTestnet: toAddressMap([
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
  const contracts: BlockchainContracts = {
    sepolia: {},
    bscTestnet: {},
  };

  for (const contractName of Object.values(ProtocolContract)) {
    const sepoliaAddress = contractAddresses.sepolia[contractName];
    const bscTestnetAddress = contractAddresses.bscTestnet[contractName];

    contracts.sepolia[contractName] = new ethers.Contract(
      sepoliaAddress,
      protocolContractABIs[contractName],
      providers.sepolia,
    );

    logger.debug("Configured {contractName} contract on sepolia: {address}", {
      contractName,
      address: sepoliaAddress,
    });

    contracts.bscTestnet[contractName] = new ethers.Contract(
      bscTestnetAddress,
      protocolContractABIs[contractName],
      providers.bscTestnet,
    );

    logger.debug(
      "Configured {contractName} contract on bscTestnet: {address}",
      {
        contractName,
        address: bscTestnetAddress,
      },
    );
  }

  return contracts;
}

export function createBlockchainConfig(deps: {
  env: BlockchainEnv;
  logger: Logger;
}) {
  const { env, logger } = deps;

  const providers = createBlockchainProviders({
    env,
  });

  const contractAddresses = createBlockchainContractAddresses(env);
  const contracts = createBlockchainContracts({
    providers,
    contractAddresses,
    logger,
  });

  function getProvider(chainId: ChainId): ethers.JsonRpcProvider {
    if (chainId === chainIds.sepolia) {
      return providers.sepolia;
    } else if (chainId === chainIds.bscTestnet) {
      return providers.bscTestnet;
    }
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }

  function getContract(
    contractName: ProtocolContract,
    chainId: ChainId,
  ): ethers.Contract {
    const contract = contracts[chainId]?.[contractName];

    if (!contract) {
      throw new Error(
        `Contract ${contractName} is not configured on ${chainId}`,
      );
    }

    return contract;
  }

  return {
    getProvider,
    getContract,
  };
}

export type BlockchainRuntime = ReturnType<typeof createBlockchainConfig>;
