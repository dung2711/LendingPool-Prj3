import {
  DataTypes,
  type InferAttributes,
  type InferCreationAttributes,
  Model,
  type Sequelize,
} from "sequelize";
import { TreasuryEventType } from "src/shared/constants/app";

export class TreasuryLog extends Model<
  InferAttributes<TreasuryLog>,
  InferCreationAttributes<TreasuryLog>
> {
  declare id: string;
  declare assetId: bigint;
  declare transactionHash: string;
  declare blockNumber: bigint;
  declare eventType: TreasuryEventType;
  declare amount: string;
  declare balanceAfter: string;
  declare fromAddress: string | null;
  declare toAddress: string | null;
  declare createdAt: Date;
}

export function initTreasuryLogModel(sequelize: Sequelize): typeof TreasuryLog {
  TreasuryLog.init(
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      assetId: {
        type: DataTypes.BIGINT,
        allowNull: false,
      },
      transactionHash: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      blockNumber: {
        type: DataTypes.BIGINT,
        allowNull: false,
      },
      eventType: {
        type: DataTypes.ENUM(...Object.values(TreasuryEventType)),
        allowNull: false,
      },
      amount: {
        type: DataTypes.DECIMAL(78, 0),
        allowNull: false,
      },
      balanceAfter: {
        type: DataTypes.DECIMAL(78, 0),
        allowNull: false,
      },
      fromAddress: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      toAddress: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      createdAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      tableName: "treasury_logs",
      timestamps: false,
      indexes: [
        {
          unique: true,
          fields: ["transactionHash"],
        },
        {
          fields: ["assetId"],
        },
        {
          fields: ["createdAt"],
        },
      ],
    },
  );

  return TreasuryLog;
}
