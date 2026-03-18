import type { ethers } from "ethers";
import type { chainIds, ProtocolContract } from "../constants/blockchain";

export type ChainName = keyof typeof chainIds;
export type ChainId = (typeof chainIds)[ChainName];

export type BlockchainProviders = Partial<
  Record<ChainId, ethers.JsonRpcProvider>
>;

export type ProtocolContractMap<T> = Partial<Record<ProtocolContract, T>>;

export type BlockchainContracts = Partial<
  Record<ChainId, ProtocolContractMap<ethers.Contract>>
>;

export type BlockchainContractAddresses = Partial<
  Record<ChainId, ProtocolContractMap<string>>
>;

export type ITransactionEventReq = {
  chainId: ChainId;
  userAddress: string;
  assetAddress: string;
  amount: string;
  transactionHash: string;
  blockNumber: number;
};

export type IAccrueEventReq = {
  chainId: ChainId;
  assetAddress: string;
  newTotalBorrows: string;
  newTotalDeposits: string;
  transactionHash: string;
  blockNumber: number;
};

export type IMarketSupportedEventReq = {
  chainId: ChainId;
  assetAddress: string;
  interestRateModelAddress: string;
  transactionHash: string;
  blockNumber: number;
};

export type IMarketUnsupportedEventReq = {
  chainId: ChainId;
  assetAddress: string;
  transactionHash: string;
  blockNumber: number;
};

export type ICollateralFactorUpdatedEventReq = {
  chainId: ChainId;
  collateralFactor: string;
  transactionHash: string;
  blockNumber: number;
};

export type ILiquidationParamsUpdatedEventReq = {
  chainId: ChainId;
  closeFactor: string;
  liquidationIncentive: string;
  liquidationThreshold: string;
  transactionHash: string;
  blockNumber: number;
};
