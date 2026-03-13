import type { ethers } from "ethers";
import type { chainIds, ProtocolContract } from "../constants/blockchain";

export type ChainName = keyof typeof chainIds;
export type ChainId = (typeof chainIds)[ChainName];

export type BlockchainProviders = Partial<
  Record<ChainName, ethers.JsonRpcProvider>
>;

export type ProtocolContractMap<T> = Partial<Record<ProtocolContract, T>>;

export type BlockchainContracts = Partial<
  Record<ChainName, ProtocolContractMap<ethers.Contract>>
>;

export type BlockchainContractAddresses = Partial<
  Record<ChainName, ProtocolContractMap<string>>
>;
