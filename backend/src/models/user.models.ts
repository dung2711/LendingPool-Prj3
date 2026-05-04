import {
  DataTypes,
  type InferAttributes,
  type InferCreationAttributes,
  Model,
  type Sequelize,
} from "sequelize";
import { chainIds } from "src/shared/constants";
import type { ChainId } from "src/shared/types";

export class User extends Model<
  InferAttributes<User>,
  InferCreationAttributes<User>
> {
  declare id: bigint;
  declare userAddress: string;
  declare chainId: ChainId;
  declare email?: string;
  declare joinedAt: Date;
  declare createdAt: Date;
}

export function initUserModel(sequelize: Sequelize): typeof User {
  User.init(
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
      },
      userAddress: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      chainId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
          isIn: [Object.values(chainIds)],
        },
      },
      email: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          isEmail: true,
        },
      },
      joinedAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      tableName: "users",
      timestamps: false,
      indexes: [
        {
          unique: true,
          fields: ["userAddress", "chainId"],
        },
      ],
    },
  );

  return User;
}
