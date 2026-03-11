import type { Sequelize } from "sequelize";
import { initAssetModel } from "../../../tmp_models";

export function createDatabaseClient(sequelize: Sequelize) {
  const Asset = initAssetModel(sequelize);

  return {
    asset: Asset,
    $sequelize: sequelize,
  };
}

export type DatabaseClient = ReturnType<typeof createDatabaseClient>;
