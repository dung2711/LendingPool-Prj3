import {
  interestRateModelABI,
  lendingPoolABI,
  liquidationABI,
  myOracleABI,
  priceRouterABI,
} from "@shared/abis";

export const chainIds = {
  sepolia: 11155111,
  bscTestnet: 97,
} as const;

export const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

export enum ProtocolContract {
  ERC20 = "ERC20",
  LendingPool = "LendingPool",
  InterestRateModel = "InterestRateModel",
  MyOracle = "MyOracle",
  Liquidation = "Liquidation",
  PriceRouter = "PriceRouter",
  Timelock = "Timelock",
}

export const timelockControllerEventsABI = [
  "event CallScheduled(bytes32 indexed id, uint256 indexed index, address target, uint256 value, bytes data, bytes32 predecessor, uint256 delay)",
  "event CallExecuted(bytes32 indexed id, uint256 indexed index, address target, uint256 value, bytes data)",
  "event CallSalt(bytes32 indexed id, bytes32 salt)",
  "event Cancelled(bytes32 indexed id)",
  "event MinDelayChange(uint256 oldDuration, uint256 newDuration)",
] as const;

export const protocolContractABIs = {
  [ProtocolContract.LendingPool]: lendingPoolABI,
  [ProtocolContract.InterestRateModel]: interestRateModelABI,
  [ProtocolContract.MyOracle]: myOracleABI,
  [ProtocolContract.Liquidation]: liquidationABI,
  [ProtocolContract.PriceRouter]: priceRouterABI,
  [ProtocolContract.Timelock]: timelockControllerEventsABI,
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
  Donated: "handleDonatedEvent",
  TreasuryWithdrawn: "handleTreasuryWithdrawnEvent",
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
  Donated: "handleDonateJob",
  TreasuryWithdrawn: "handleTreasuryWithdrawnJob",
  MarketSupported: "handleMarketSupportedJob",
  MarketUnsupported: "handleMarketUnsupportedJob",
  CollateralFactorUpdated: "handleCollateralFactorUpdatedJob",
  LiquidationParamsUpdated: "handleLiquidationParamsUpdatedJob",
} as const;
