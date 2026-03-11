import {
  DataTypes,
  type InferAttributes,
  type InferCreationAttributes,
  Model,
  type Sequelize,
} from "sequelize";

export class UserAsset extends Model<
  InferAttributes<UserAsset>,
  InferCreationAttributes<UserAsset>
> {
  declare userId: string;
  declare assetId: string;
  declare depositedAmount: string;
  declare borrowedAmount: string;
  declare createdAt: Date;
  declare updatedAt: Date;
}

export function initUserAssetModel(sequelize: Sequelize): typeof UserAsset {
  UserAsset.init(
    {
      userId: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      assetId: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      depositedAmount: {
        type: DataTypes.DECIMAL(78, 0),
        defaultValue: "0",
      },
      borrowedAmount: {
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
      tableName: "user_assets",
      timestamps: true,
      indexes: [
        {
          fields: ["userId"],
        },
        {
          fields: ["assetId"],
        },
      ],
    },
  );

  return UserAsset;
}
