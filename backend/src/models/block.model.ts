import {
  DataTypes,
  type InferAttributes,
  type InferCreationAttributes,
  Model,
  type Sequelize,
} from "sequelize";
import { chainIds } from "src/shared/constants/blockchain";
import type { ChainId } from "src/shared/types";

export class Block extends Model<
  InferAttributes<Block>,
  InferCreationAttributes<Block>
> {
  declare number: bigint;
  declare chainId: ChainId;
  declare hash: string;
  declare parentHash: string;
  declare isCanonical: boolean;
  declare indexedAt: Date;
}

export function initBlockModel(sequelize: Sequelize): typeof Block {
  Block.init(
    {
      number: {
        type: DataTypes.BIGINT,
        allowNull: false,
      },
      chainId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
          isIn: [Object.values(chainIds)],
        },
      },
      hash: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      parentHash: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      isCanonical: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
      },
      indexedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      tableName: "blocks",
      timestamps: false,
      indexes: [
        {
          unique: true,
          fields: ["hash", "chainId"],
        },
        {
          fields: ["isCanonical", "chainId", "number"],
        },
        {
          fields: ["chainId", "number"],
        },
      ],
    },
  );

  return Block;
}
