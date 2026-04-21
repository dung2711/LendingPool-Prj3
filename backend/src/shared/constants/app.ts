export enum NodeEnv {
  Development = "development",
  Production = "production",
  Test = "test",
}

export enum LogLevel {
  Debug = "debug",
  Info = "info",
  Warn = "warn",
  Error = "error",
}

export enum TransactionType {
  Deposit = "deposit",
  Withdraw = "withdraw",
  Borrow = "borrow",
  Repay = "repay",
  Liquidate = "liquidate",
}

export enum RabbitMQEx {
  BLOCKCHAIN_EVENTS = "blockchain.events",
  CRONNER_EVENTS = "cronner.events",
  ADMIN_EVENTS = "admin.events",
  NOTI_EVENTS = "notification.events",
}

export enum RabbitMQQueue {
  BLOCKCHAIN_DEPOSIT = "blockchain.deposit",
  BLOCKCHAIN_WITHDRAW = "blockchain.withdraw",
  BLOCKCHAIN_BORROW = "blockchain.borrow",
  BLOCKCHAIN_REPAY = "blockchain.repay",
  BLOCKCHAIN_LIQUIDATE = "blockchain.liquidate",
  BLOCKCHAIN_ACCRUE_INTEREST = "blockchain.accrue_interest",
  BLOCKCHAIN_TREASURY_DONATE = "blockchain.treasury_donate",
  BLOCKCHAIN_TREASURY_WITHDRAWN = "blockchain.treasury_withdrawn",
  BLOCKCHAIN_MARKET_SUPPORTED = "blockchain.market_supported",
  BLOCKCHAIN_MARKET_UNSUPPORTED = "blockchain.market_unsupported",
  BLOCKCHAIN_COLLATERAL_FACTOR_UPDATED = "blockchain.collateral_factor_updated",
  BLOCKCHAIN_LIQUIDATION_PARAMS_UPDATED = "blockchain.liquidation_params_updated",
  CRONNER_ASSET_SNAPSHOT = "cronner.asset_snapshot",
  CRONNER_USER_SNAPSHOT = "cronner.user_snapshot",

  ADMIN_PROPOSAL_DB = "admin.proposal.db", // bind admin.#
  ADMIN_PROPOSAL_NOTI = "admin.proposal.noti", // bind admin.#

  NOTI_EMAIL_OTP = "noti.email.otp",
  NOTI_EMAIL_ALERT = "noti.email.alert",
  NOTI_TELE_ALERT = "noti.tele.alert",
}

export enum RabbitMQBindingKey {
  ADMIN_BINDING_KEY = "admin.#",
}

export enum TreasuryEventType {
  Accrue = "accrue",
  Donate = "donate",
  Withdraw = "withdraw",
}

export enum CronnerType {
  UserSnapshot = 0,
  AssetSnapshot = 1,
}

export enum ProposalStatus {
  Proposed = 0,
  Scheduled = 1,
  Executed = 2,
  Cancelled = 3,
}

export enum AdminEventType {
  // Safe events
  SAFE_PROPOSED = "admin.safe.proposed",
  SAFE_CONFIRMED = "admin.safe.confirmed",

  // Timelock events
  TIMELOCK_SCHEDULED = "admin.timelock.scheduled",
  TIMELOCK_EXECUTED = "admin.timelock.executed",
  TIMELOCK_CANCELLED = "admin.timelock.cancelled",
}
