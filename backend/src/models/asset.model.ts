import {
  DataTypes,
  type InferAttributes,
  type InferCreationAttributes,
  Model,
  type Sequelize,
} from "sequelize";

export class Asset extends Model<
  InferAttributes<Asset>,
  InferCreationAttributes<Asset>
> {
  declare id: string;
  declare assetAddress: string;
  declare symbol: string;
  declare name: string;
  declare decimals: number;
  declare isSupported: boolean;
  declare totalDeposited: string;
  declare totalBorrowed: string;
  declare createdAt: Date;
  declare updatedAt: Date;
}

export function initAssetModel(sequelize: Sequelize): typeof Asset {
  Asset.init(
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      assetAddress: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      symbol: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      decimals: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      isSupported: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
      },
      totalDeposited: {
        type: DataTypes.DECIMAL(78, 0),
        defaultValue: "0",
      },
      totalBorrowed: {
        type: DataTypes.DECIMAL(78, 0),
        defaultValue: "0",
      },
      createdAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
      updatedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      tableName: "assets",
      timestamps: true,
      indexes: [
        {
          unique: true,
          fields: ["assetAddress"],
        },
        {
          fields: ["isSupported"],
        },
      ],
    },
  );

  return Asset;
}
