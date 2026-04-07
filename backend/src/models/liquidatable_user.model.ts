import {
  DataTypes,
  type InferAttributes,
  type InferCreationAttributes,
  Model,
  type Sequelize,
} from "sequelize";

export class LiquidatableUser extends Model<
  InferAttributes<LiquidatableUser>,
  InferCreationAttributes<LiquidatableUser>
> {
  declare id: string;
  declare userId: bigint;
}

export function initLiquidatableUserModel(
  sequelize: Sequelize,
): typeof LiquidatableUser {
  LiquidatableUser.init(
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      userId: {
        type: DataTypes.BIGINT,
        allowNull: false,
      },
    },
    {
      sequelize,
      tableName: "liquidatable_users",
      timestamps: false,
    },
  );

  return LiquidatableUser;
}
