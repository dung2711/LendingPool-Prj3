import sequelize from "../config/database.js";
import { DataTypes } from "sequelize";

const Market_config = sequelize.define('Market_config', {
    marketAddress : {
        type: DataTypes.STRING,
        allowNull: false,
        primaryKey: true
    },
    baseRate: {
        type: DataTypes.DECIMAL(36,0),
        allowNull: false,
        defaultValue: '0'
    },
    slope1: {
        type: DataTypes.DECIMAL(36,0),
        allowNull: false,
        defaultValue: '0'
    },
    slope2: {
        type: DataTypes.DECIMAL(36,0),
        allowNull: false,
        defaultValue: '0'
    },
    optimalUtilization: {
        type: DataTypes.DECIMAL(36,0),
        allowNull: false,
        defaultValue: '0'
    },
    reserveFactor: {
        type: DataTypes.DECIMAL(36,0),
        allowNull: false,
        defaultValue: '0'
    },
    collateralFactor: {
        type: DataTypes.DECIMAL(36,0),
        allowNull: false,
        defaultValue: '0'
    },
    closeFactor: {
        type: DataTypes.DECIMAL(36,0),
        allowNull: false,
    },
    liquidationIncentive: {
        type: DataTypes.DECIMAL(36,0),
        allowNull: false,
        defaultValue: '0'
    },
    liquidationThreshold: {
        type: DataTypes.DECIMAL(36,0),
        allowNull: false,
        defaultValue: '0'
    }
}, {
    timestamps: false
});

export default Market_config;