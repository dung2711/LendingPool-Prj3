import { DataTypes } from "sequelize";
import sequelize from "../config/database.js";

const Transaction = sequelize.define(
	"Transaction",
	{
		id: {
			type: DataTypes.BIGINT,
			autoIncrement: true,
			primaryKey: true,
		},
		hash: {
			type: DataTypes.STRING,
			allowNull: false,
			unique: true,
		},
		userAddress: {
			type: DataTypes.STRING,
			allowNull: false,
		},
		assetAddress: {
			type: DataTypes.STRING,
			allowNull: false,
		},
		type: {
			type: DataTypes.ENUM(
				"deposit",
				"borrow",
				"repay",
				"withdraw",
				"liquidated",
			),
			allowNull: false,
		},
		amount: {
			type: DataTypes.DECIMAL(78, 0),
			allowNull: false,
		},
		amountUSD: {
			type: DataTypes.DECIMAL(78, 0),
			allowNull: true,
			comment: "USD value at transaction time (18 decimals)",
		},
		blockNumber: {
			type: DataTypes.INTEGER,
			allowNull: false,
		},
		timestamp: {
			type: DataTypes.DATE,
			allowNull: false,
			defaultValue: DataTypes.NOW,
		},
	},
	{
		timestamps: false,
		indexes: [
			{ fields: ["userAddress", "id"] },
			{ fields: ["userAddress", "timestamp"] },
		],
	},
);

export default Transaction;
