import sequelize from  "../config/database.js";
import { DataTypes } from "sequelize";

const User = sequelize.define('User', {
    address: {
        type: DataTypes.STRING,
        allowNull: false,
        primaryKey: true
    },
    joinedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    }
}, {
    timestamps: false
});

export default User;