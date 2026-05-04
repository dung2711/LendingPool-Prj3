import {
  DataTypes,
  type InferAttributes,
  type InferCreationAttributes,
  Model,
  type Sequelize,
} from "sequelize";
import { chainIds } from "src/shared/constants";
import type { ChainId } from "src/shared/types";

export class Proposal extends Model<
  InferAttributes<Proposal>,
  InferCreationAttributes<Proposal>
> {
  declare id: bigint;
  declare chainId: ChainId;

  declare operationId?: string;
  declare target?: string; // target contract address
  declare value?: string; // value to send with the transaction (in wei)
  declare calldata?: string; // encoded function call data
  declare predecessors?: string;
  declare salt?: string;
  declare delay?: number; // delay in seconds before the proposal can be executed
  declare eta?: Date; // estimated time of execution
  declare timelockExecutedTxHash?: string; // hash of the timelock execution transaction

  declare safeTxHash?: string; // hash of the Safe transaction
  declare proposer: string;
  declare currentSigners: number;
  declare multisigThreshold: number;
  declare safeExecutedTxHash?: string; // hash of the executed transaction

  declare status: number; // 0: proposed, 1: scheduled, 2: executed, 3: cancelled
  declare decodedAction?: unknown; // store target contract and parameters
  declare createdAt: Date;
  declare updatedAt: Date;
}

export function initProposalModel(sequelize: Sequelize): typeof Proposal {
  Proposal.init(
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
      },
      chainId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
          isIn: [Object.values(chainIds)],
        },
      },
      operationId: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      target: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      value: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      calldata: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      predecessors: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      salt: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      delay: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      eta: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      timelockExecutedTxHash: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      safeTxHash: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      safeExecutedTxHash: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      proposer: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      currentSigners: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      multisigThreshold: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      status: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      decodedAction: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      tableName: "proposals",
      timestamps: true,
      indexes: [
        {
          fields: ["chainId"],
        },
        {
          fields: ["status"],
        },
        {
          unique: true,
          fields: ["operationId", "chainId"],
        },
        {
          unique: true,
          fields: ["safeTxHash", "chainId"],
        },
      ],
    },
  );

  return Proposal;
}
