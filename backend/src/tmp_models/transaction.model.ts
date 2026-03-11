import {
  DataTypes,
  type InferAttributes,
  type InferCreationAttributes,
  Model,
  type Sequelize,
} from "sequelize";
import { TransactionType } from "../shared/constants/transaction";

export class Transaction extends Model<
  InferAttributes<Transaction>,
  InferCreationAttributes<Transaction>
> {
  declare id: bigint;
  declare transactionHash: string;
  declare userId: string;
  declare assetId: string;
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
      },
      transactionHash: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      userId: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      assetId: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      type: {
        type: DataTypes.ENUM(
          TransactionType.Deposit,
          TransactionType.Withdraw,
          TransactionType.Borrow,
          TransactionType.Repay,
          TransactionType.Liquidate,
        ),
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
