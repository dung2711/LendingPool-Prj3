import { DataTypes } from "sequelize";
import sequelize from "../config/database.js";

const Liquidatable_Users = sequelize.define(
	"Liquidatable_Users",
	{
		userAddress: {
			type: DataTypes.STRING,
			allowNull: false,
			primaryKey: true,
		},
	},
	{
		timestamps: false,
	},
);

export default Liquidatable_Users;
