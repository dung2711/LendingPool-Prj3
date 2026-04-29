import {
  DataTypes,
  type InferAttributes,
  type InferCreationAttributes,
  Model,
  type Sequelize,
} from "sequelize";

export class UserSnapshot extends Model<
  InferAttributes<UserSnapshot>,
  InferCreationAttributes<UserSnapshot>
> {
  declare id: string;
  declare userId: bigint;
  declare blockNumber: number;
  declare createdAt: Date;
  declare totalDepositedUSD: string;
  declare totalBorrowedUSD: string;
  declare netWorthUSD: string;
  declare healthFactor: string;
}

export function initUserSnapshotModel(
  sequelize: Sequelize,
): typeof UserSnapshot {
  UserSnapshot.init(
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      userId: {
        type: DataTypes.BIGINT,
        allowNull: false,
      },
      blockNumber: {
        type: DataTypes.BIGINT,
        allowNull: false,
      },
      totalDepositedUSD: {
        type: DataTypes.DECIMAL(78, 0),
        defaultValue: "0",
      },
      totalBorrowedUSD: {
        type: DataTypes.DECIMAL(78, 0),
        defaultValue: "0",
      },
      netWorthUSD: {
        type: DataTypes.DECIMAL(78, 0),
        defaultValue: "0",
      },
      healthFactor: {
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
      tableName: "user_snapshots",
      timestamps: false,
      indexes: [
        {
          fields: ["userId"],
        },
        {
          fields: ["createdAt"],
        },
        {
          fields: ["userId", "createdAt"],
        },
        {
          fields: ["blockNumber"],
        },
      ],
    },
  );

  return UserSnapshot;
}
