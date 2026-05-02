import {
  DataTypes,
  type InferAttributes,
  type InferCreationAttributes,
  Model,
  type NonAttribute,
  type Sequelize,
} from "sequelize";
import type { User } from "./user.models";

export class Session extends Model<
  InferAttributes<Session>,
  InferCreationAttributes<Session>
> {
  declare id: string;
  declare device: string;
  declare ip: string;
  declare token: string;
  declare createdById: bigint;
  declare expired: Date;
  declare revoked: boolean;
  declare createdAt: Date;
  declare updatedAt: Date;

  declare createdBy?: NonAttribute<User>;
}

export function initSessionModel(sequelize: Sequelize): typeof Session {
  Session.init(
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      device: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      ip: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      token: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      createdById: {
        type: DataTypes.BIGINT,
        allowNull: false,
      },
      expired: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      revoked: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
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
      tableName: "sessions",
      timestamps: true,
      indexes: [
        {
          unique: true,
          fields: ["token"],
        },
        {
          fields: ["createdById"],
        },
        {
          fields: ["expired"],
        },
        {
          fields: ["revoked"],
        },
      ],
    },
  );

  return Session;
}
