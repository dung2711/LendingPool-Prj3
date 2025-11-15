import sequelize from "../config/database.js";
import { DataTypes } from "sequelize";

const Asset = sequelize.define('Asset', {
    address : {
        type: DataTypes.STRING,
        allowNull: false,
        primaryKey: true
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    symbol: {
        type: DataTypes.STRING,
        allowNull: false
    },
    decimals: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    isSupported: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
    },
    totalDeposits: {
        type: DataTypes.DECIMAL(78,0),
        allowNull: false,
        defaultValue: '0'
    },
    totalBorrows: {
        type: DataTypes.DECIMAL(78,0),
        allowNull: false,
        defaultValue: '0'
    }
}, {
    timestamps: false
});

export default Asset;