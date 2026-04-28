import {
  DataTypes,
  type InferAttributes,
  type InferCreationAttributes,
  Model,
  type Sequelize,
} from "sequelize";
import { chainIds } from "src/shared/constants/blockchain";
import type { ChainId } from "src/shared/types";

export class Scanner extends Model<
  InferAttributes<Scanner>,
  InferCreationAttributes<Scanner>
> {
  declare chainId: ChainId;
  declare lastScannedBlock: bigint;
  declare lastScannedAt: Date;
  declare createdAt: Date;
}

export const initScannerModel = (sequelize: Sequelize): typeof Scanner => {
  Scanner.init(
    {
      chainId: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        validate: {
          isIn: [Object.values(chainIds)],
        },
      },
      lastScannedBlock: {
        type: DataTypes.BIGINT,
        allowNull: false,
      },
      lastScannedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
      createdAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      tableName: "scanners",
      timestamps: false,
    },
  );

  return Scanner;
};
