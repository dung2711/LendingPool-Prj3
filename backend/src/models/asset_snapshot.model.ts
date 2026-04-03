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
  declare assetId: string;
  declare blockNumber: number;
  declare totalDeposited: string;
  declare totalBorrowed: string;
  declare treasuryBalance: string;
  declare utilizationRate: string;
  declare depositRate: string;
  declare borrowRate: string;
  declare snapshotAt: Date;
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
        type: DataTypes.STRING,
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
        type: DataTypes.DECIMAL(18, 16),
        defaultValue: "0",
      },
      depositRate: {
        type: DataTypes.DECIMAL(18, 16),
        defaultValue: "0",
      },
      borrowRate: {
        type: DataTypes.DECIMAL(18, 16),
        defaultValue: "0",
      },
      snapshotAt: {
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
          fields: ["snapshotAt"],
        },
        {
          fields: ["assetId", "snapshotAt"],
        },
        {
          fields: ["blockNumber"],
        },
      ],
    },
  );

  return AssetSnapshot;
}
