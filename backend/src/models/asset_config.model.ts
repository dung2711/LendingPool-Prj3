import {
  DataTypes,
  type InferAttributes,
  type InferCreationAttributes,
  Model,
  type Sequelize,
} from "sequelize";

export class AssetConfig extends Model<
  InferAttributes<AssetConfig>,
  InferCreationAttributes<AssetConfig>
> {
  declare id: string;
  declare assetId: string;
  declare baseRate: string;
  declare slope1: string;
  declare slope2: string;
  declare optimalUtilization: string;
  declare reserveFactor: string;
  declare collateralFactor: string;
  declare closeFactor: string;
  declare liquidationIncentive: string;
  declare liquidationThreshold: string;
  declare createdAt: Date;
  declare updatedAt: Date;
}

export function initAssetConfigModel(sequelize: Sequelize): typeof AssetConfig {
  AssetConfig.init(
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      assetId: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      baseRate: {
        type: DataTypes.DECIMAL(36, 0),
        allowNull: false,
      },
      slope1: {
        type: DataTypes.DECIMAL(36, 0),
        allowNull: false,
      },
      slope2: {
        type: DataTypes.DECIMAL(36, 0),
        allowNull: false,
      },
      optimalUtilization: {
        type: DataTypes.DECIMAL(36, 0),
        allowNull: false,
      },
      reserveFactor: {
        type: DataTypes.DECIMAL(36, 0),
        allowNull: false,
      },
      collateralFactor: {
        type: DataTypes.DECIMAL(36, 0),
        allowNull: false,
      },
      closeFactor: {
        type: DataTypes.DECIMAL(36, 0),
        allowNull: false,
      },
      liquidationIncentive: {
        type: DataTypes.DECIMAL(36, 0),
        allowNull: false,
      },
      liquidationThreshold: {
        type: DataTypes.DECIMAL(36, 0),
        allowNull: false,
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
      tableName: "asset_configs",
      timestamps: true,
      indexes: [
        {
          fields: ["assetId"],
        },
      ],
    },
  );

  return AssetConfig;
}
