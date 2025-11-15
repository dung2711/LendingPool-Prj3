import sequelize from "../config/database.js";
import { DataTypes } from "sequelize";

const User_Asset = sequelize.define('User_Asset', {
    userAddress: {
        type: DataTypes.STRING,
        allowNull: false,
        primaryKey: true
    },
    assetAddress: {
        type: DataTypes.STRING,
        allowNull: false,
        primaryKey: true
    },
    deposited: {
        type: DataTypes.DECIMAL(78,0),
        allowNull: false,
        defaultValue: '0'
    },
    borrowed: {
        type: DataTypes.DECIMAL(78,0),
        allowNull: false,
        defaultValue: '0'
    }
}, {
    timestamps: false
});

export default User_Asset;