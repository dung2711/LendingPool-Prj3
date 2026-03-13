import {
  interestRateModelABI,
  lendingPoolABI,
  liquidationABI,
  myOracleABI,
  priceRouterABI,
} from "../../../../shared/abis";

export const chainIds = {
  sepolia: 11155111,
  bscTestnet: 97,
} as const;

export enum ProtocolContract {
  LendingPool = "LendingPool",
  InterestRateModel = "InterestRateModel",
  MyOracle = "MyOracle",
  Liquidation = "Liquidation",
  PriceRouter = "PriceRouter",
}

export const protocolContractABIs = {
  [ProtocolContract.LendingPool]: lendingPoolABI,
  [ProtocolContract.InterestRateModel]: interestRateModelABI,
  [ProtocolContract.MyOracle]: myOracleABI,
  [ProtocolContract.Liquidation]: liquidationABI,
  [ProtocolContract.PriceRouter]: priceRouterABI,
} as const;
