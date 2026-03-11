import type { Sequelize } from "sequelize";
import {
  initAssetConfigModel,
  initAssetModel,
  initLiquidatableUserModel,
  initScannerModel,
  initTransactionModel,
  initUserAssetModel,
  initUserModel,
} from "../../../tmp_models";

export function createDatabaseClient(sequelize: Sequelize) {
  const Asset = initAssetModel(sequelize);
  const User = initUserModel(sequelize);
  const AssetConfig = initAssetConfigModel(sequelize);
  const LiquidatableUser = initLiquidatableUserModel(sequelize);
  const Scanner = initScannerModel(sequelize);
  const Transaction = initTransactionModel(sequelize);
  const UserAsset = initUserAssetModel(sequelize);

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

  return {
    asset: Asset,
    user: User,
    assetConfig: AssetConfig,
    liquidatableUser: LiquidatableUser,
    scanner: Scanner,
    transaction: Transaction,
    userAsset: UserAsset,
    $sequelize: sequelize,
  };
}

export type DatabaseClient = ReturnType<typeof createDatabaseClient>;
