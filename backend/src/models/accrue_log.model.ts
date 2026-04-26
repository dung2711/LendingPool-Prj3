import {
  DataTypes,
  type InferAttributes,
  type InferCreationAttributes,
  Model,
  type Sequelize,
} from "sequelize";
import { chainIds } from "src/shared/constants";
import type { ChainId } from "src/shared/types/blockchain";

export class AccrueLog extends Model<
  InferAttributes<AccrueLog>,
  InferCreationAttributes<AccrueLog>
> {
  declare id: string;
  declare assetId: bigint;
  declare chainId: ChainId;
  declare transactionHash: string;
  declare blockNumber: bigint;
  declare interestAccrued: string;
  declare toDeposit: string;
  declare toTreasury: string;
  declare newTotalBorrows: string;
  declare newBorrowIndex: string;
  declare newTotalDeposits: string;
  declare newDepositIndex: string;
  declare createdAt: Date;
}

export function initAccrueLogModel(sequelize: Sequelize): typeof AccrueLog {
  AccrueLog.init(
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      assetId: {
        type: DataTypes.BIGINT,
        allowNull: false,
      },
      chainId: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: [Object.values(chainIds)],
        },
      },
      transactionHash: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      blockNumber: {
        type: DataTypes.BIGINT,
        allowNull: false,
      },
      interestAccrued: {
        type: DataTypes.DECIMAL(78, 0),
        allowNull: false,
      },
      toDeposit: {
        type: DataTypes.DECIMAL(78, 0),
        allowNull: false,
      },
      toTreasury: {
        type: DataTypes.DECIMAL(78, 0),
        allowNull: false,
      },
      newTotalBorrows: {
        type: DataTypes.DECIMAL(78, 0),
        allowNull: false,
      },
      newBorrowIndex: {
        type: DataTypes.DECIMAL(78, 0),
        allowNull: false,
      },
      newTotalDeposits: {
        type: DataTypes.DECIMAL(78, 0),
        allowNull: false,
      },
      newDepositIndex: {
        type: DataTypes.DECIMAL(78, 0),
        allowNull: false,
      },
      createdAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      tableName: "accrue_logs",
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

  return AccrueLog;
}
