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
  declare userId: string;
  declare blockNumber: number;
  declare snapshotAt: Date;
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
        type: DataTypes.STRING,
        allowNull: false,
      },
      blockNumber: {
        type: DataTypes.BIGINT,
        allowNull: false,
      },
      snapshotAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      totalDepositedUSD: {
        type: DataTypes.DECIMAL(36, 18),
        defaultValue: "0",
      },
      totalBorrowedUSD: {
        type: DataTypes.DECIMAL(36, 18),
        defaultValue: "0",
      },
      netWorthUSD: {
        type: DataTypes.DECIMAL(36, 18),
        defaultValue: "0",
      },
      healthFactor: {
        type: DataTypes.DECIMAL(36, 18),
        defaultValue: "0",
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
          fields: ["snapshotAt"],
        },
        {
          fields: ["userId", "snapshotAt"],
        },
        {
          fields: ["blockNumber"],
        },
      ],
    },
  );

  return UserSnapshot;
}
