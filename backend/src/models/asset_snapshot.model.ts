import {
  DataTypes,
  type InferAttributes,
  type InferCreationAttributes,
  Model,
  type Sequelize,
} from "sequelize";

export class AssetSnapshot extends Model<
  InferAttributes<AssetSnapshot>,
  InferCreationAttributes<AssetSnapshot>
> {
  declare id: string;
  declare assetId: bigint;
  declare blockNumber: number;
  declare totalDeposited: string;
  declare totalBorrowed: string;
  declare treasuryBalance: string;
  declare utilizationRate: string;
  declare depositRate: string;
  declare borrowRate: string;
  declare createdAt: Date;
}

export function initAssetSnapshotModel(
  sequelize: Sequelize,
): typeof AssetSnapshot {
  AssetSnapshot.init(
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      assetId: {
        type: DataTypes.BIGINT,
        allowNull: false,
      },
      blockNumber: {
        type: DataTypes.BIGINT,
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
      treasuryBalance: {
        type: DataTypes.DECIMAL(78, 0),
        defaultValue: "0",
      },
      utilizationRate: {
        type: DataTypes.DECIMAL(78, 0),
        defaultValue: "0",
      },
      depositRate: {
        type: DataTypes.DECIMAL(78, 0),
        defaultValue: "0",
      },
      borrowRate: {
        type: DataTypes.DECIMAL(78, 0),
        defaultValue: "0",
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
    },
    {
      sequelize,
      tableName: "asset_snapshots",
      timestamps: false,
      indexes: [
        {
          fields: ["assetId"],
        },
        {
          fields: ["createdAt"],
        },
        {
          fields: ["assetId", "createdAt"],
        },
        {
          fields: ["blockNumber"],
        },
      ],
    },
  );

  return AssetSnapshot;
}
