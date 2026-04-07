import type { Sequelize } from "sequelize";
import {
  initAccrueLogModel,
  initAssetConfigModel,
  initAssetModel,
  initAssetSnapshotModel,
  initCronnerStateModel,
  initLiquidatableUserModel,
  initScannerModel,
  initTransactionModel,
  initTreasuryLogModel,
  initUserAssetModel,
  initUserModel,
  initUserSnapshotModel,
} from "../../../models";

export function createDatabaseClient(sequelize: Sequelize) {
  const Asset = initAssetModel(sequelize);
  const User = initUserModel(sequelize);
  const AssetConfig = initAssetConfigModel(sequelize);
  const LiquidatableUser = initLiquidatableUserModel(sequelize);
  const Scanner = initScannerModel(sequelize);
  const Transaction = initTransactionModel(sequelize);
  const UserAsset = initUserAssetModel(sequelize);
  const AssetSnapshot = initAssetSnapshotModel(sequelize);
  const UserSnapshot = initUserSnapshotModel(sequelize);
  const TreasuryLog = initTreasuryLogModel(sequelize);
  const AccrueLog = initAccrueLogModel(sequelize);
  const CronnerState = initCronnerStateModel(sequelize);

  // User <-> Asset (M:N via UserAsset)
  User.belongsToMany(Asset, {
    through: UserAsset,
    foreignKey: "userId",
    otherKey: "assetId",
  });
  Asset.belongsToMany(User, {
    through: UserAsset,
    foreignKey: "assetId",
    otherKey: "userId",
  });

  // Asset <-> AssetConfig (1:1)
  Asset.hasOne(AssetConfig, { foreignKey: "assetId", sourceKey: "id" });
  AssetConfig.belongsTo(Asset, { foreignKey: "assetId" });

  // User <-> Transaction (1:N)
  User.hasMany(Transaction, { foreignKey: "userId", sourceKey: "id" });
  Transaction.belongsTo(User, { foreignKey: "userId" });

  // Asset <-> Transaction (1:N)
  Asset.hasMany(Transaction, { foreignKey: "assetId", sourceKey: "id" });
  Transaction.belongsTo(Asset, { foreignKey: "assetId" });

  // User <-> LiquidatableUser (1:N)
  User.hasMany(LiquidatableUser, { foreignKey: "userId", sourceKey: "id" });
  LiquidatableUser.belongsTo(User, { foreignKey: "userId" });

  // User <-> UserAsset (1:N) — direct relationship for join-table
  User.hasMany(UserAsset, { foreignKey: "userId", sourceKey: "id" });
  UserAsset.belongsTo(User, { foreignKey: "userId" });

  // Asset <-> UserAsset (1:N) — direct relationship for join-table
  Asset.hasMany(UserAsset, { foreignKey: "assetId", sourceKey: "id" });
  UserAsset.belongsTo(Asset, { foreignKey: "assetId" });

  // Asset <-> AssetSnapshot (1:N)
  Asset.hasMany(AssetSnapshot, { foreignKey: "assetId", sourceKey: "id" });
  AssetSnapshot.belongsTo(Asset, { foreignKey: "assetId" });

  // User <-> UserSnapshot (1:N)
  User.hasMany(UserSnapshot, { foreignKey: "userId", sourceKey: "id" });
  UserSnapshot.belongsTo(User, { foreignKey: "userId" });

  // Asset <-> TreasuryLog (1:N)
  Asset.hasMany(TreasuryLog, { foreignKey: "assetId", sourceKey: "id" });
  TreasuryLog.belongsTo(Asset, { foreignKey: "assetId" });

  // Asset <-> AccrueLog (1:N)
  Asset.hasMany(AccrueLog, { foreignKey: "assetId", sourceKey: "id" });
  AccrueLog.belongsTo(Asset, { foreignKey: "assetId" });

  return {
    asset: Asset,
    user: User,
    assetConfig: AssetConfig,
    liquidatableUser: LiquidatableUser,
    scanner: Scanner,
    transaction: Transaction,
    userAsset: UserAsset,
    assetSnapshot: AssetSnapshot,
    userSnapshot: UserSnapshot,
    treasuryLog: TreasuryLog,
    accrueLog: AccrueLog,
    cronnerState: CronnerState,
    $sequelize: sequelize,
  };
}

export type DatabaseClient = ReturnType<typeof createDatabaseClient>;
