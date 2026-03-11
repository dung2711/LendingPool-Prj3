import {
  DataTypes,
  type InferAttributes,
  type InferCreationAttributes,
  Model,
  type Sequelize,
} from "sequelize";

export class User extends Model<
  InferAttributes<User>,
  InferCreationAttributes<User>
> {
  declare id: string;
  declare userAddress: string;
  declare joinedAt: Date;
  declare createdAt: Date;
}

export function initUserModel(sequelize: Sequelize): typeof User {
  User.init(
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      userAddress: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
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
          fields: ["userAddress"],
        },
      ],
    },
  );

  return User;
}
