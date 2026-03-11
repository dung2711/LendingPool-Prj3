import {
  DataTypes,
  type InferAttributes,
  type InferCreationAttributes,
  Model,
  type Sequelize,
} from "sequelize";

export class Scanner extends Model<
  InferAttributes<Scanner>,
  InferCreationAttributes<Scanner>
> {
  declare chainId: string;
  declare lastScannedBlock: number;
  declare lastScannedAt: Date;
  declare createdAt: Date;
}

export const initScannerModel = (sequelize: Sequelize): typeof Scanner => {
  Scanner.init(
    {
      chainId: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      lastScannedBlock: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      lastScannedAt: {
        type: DataTypes.DATE,
        allowNull: false,
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
