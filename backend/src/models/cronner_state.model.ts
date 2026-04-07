import {
  DataTypes,
  type InferAttributes,
  type InferCreationAttributes,
  Model,
  type Sequelize,
} from "sequelize";

export class CronnerState extends Model<
  InferAttributes<CronnerState>,
  InferCreationAttributes<CronnerState>
> {
  declare id: string;
  declare type: number; // 0: user snapshot, 1: asset snapshot
  declare lastSnappedId: bigint; // userId for user snapshot, assetId for asset snapshot
  declare createdAt: Date;
  declare updatedAt: Date;
}

export function initCronnerStateModel(
  sequelize: Sequelize,
): typeof CronnerState {
  CronnerState.init(
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      type: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      lastSnappedId: {
        type: DataTypes.BIGINT,
        allowNull: false,
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
      tableName: "cronner_states",
    },
  );
  return CronnerState;
}
