import {
  interestRateModelABI,
  lendingPoolABI,
  liquidationABI,
  myOracleABI,
  priceRouterABI,
} from "../../../shared/abis.js";

export const chainIds = {
  sepolia: 11155111,
  bscTestnet: 97,
} as const;

export enum ProtocolContract {
  ERC20 = "ERC20",
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

export const erc20ABI = [
  // Only include the functions we need
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
] as const;

export const protocolEventHandlers = {
  Deposit: "handleDepositEvent",
  Withdraw: "handleWithdrawEvent",
  Borrow: "handleBorrowEvent",
  Repay: "handleRepayEvent",
  CollateralSeized: "handleCollateralSeizedEvent",
  Accrue: "handleAccrueEvent",
  MarketUnsupported: "handleMarketUnsupportedEvent",
  MarketSupported: "handleMarketSupportedEvent",
  CollateralFactorUpdated: "handleCollateralFactorUpdatedEvent",
  LiquidationParamsUpdated: "handleLiquidationParamsUpdatedEvent",
} as const;

export const protocolJobHandlers = {
  Deposit: "handleDepositJob",
  Withdraw: "handleWithdrawJob",
  Borrow: "handleBorrowJob",
  Repay: "handleRepayJob",
  CollateralSeized: "handleCollateralSeizedJob",
  Accrue: "handleAccrueJob",
  MarketSupported: "handleMarketSupportedJob",
  MarketUnsupported: "handleMarketUnsupportedJob",
  CollateralFactorUpdated: "handleCollateralFactorUpdatedJob",
  LiquidationParamsUpdated: "handleLiquidationParamsUpdatedJob",
} as const;
