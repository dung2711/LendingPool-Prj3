import {
  DataTypes,
  type InferAttributes,
  type InferCreationAttributes,
  Model,
  type Sequelize,
} from "sequelize";
import { TransactionType } from "../shared/constants";

export class Transaction extends Model<
  InferAttributes<Transaction>,
  InferCreationAttributes<Transaction>
> {
  declare id: bigint;
  declare transactionHash: string;
  declare chainId: string;
  declare userId: bigint;
  declare assetId: bigint;
  declare type: TransactionType;
  declare amount: string;
  declare amountUSD: string;
  declare blockNumber: bigint;
  declare createdAt: Date;
}

export function initTransactionModel(sequelize: Sequelize): typeof Transaction {
  Transaction.init(
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
      },
      transactionHash: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      chainId: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      userId: {
        type: DataTypes.BIGINT,
        allowNull: false,
      },
      assetId: {
        type: DataTypes.BIGINT,
        allowNull: false,
      },
      type: {
        type: DataTypes.ENUM(...Object.values(TransactionType)),
        allowNull: false,
      },
      amount: {
        type: DataTypes.DECIMAL(78, 0),
        allowNull: false,
      },
      amountUSD: {
        type: DataTypes.DECIMAL(78, 0),
        allowNull: false,
      },
      blockNumber: {
        type: DataTypes.BIGINT,
        allowNull: false,
      },
      createdAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      tableName: "transactions",
      timestamps: false,
      indexes: [
        {
          fields: ["transactionHash"],
        },
        {
          fields: ["chainId"],
        },
        {
          fields: ["userId"],
        },
        {
          fields: ["assetId"],
        },
        {
          fields: ["type"],
        },
      ],
    },
  );
  return Transaction;
}
