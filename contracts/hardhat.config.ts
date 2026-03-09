import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "solidity-coverage";
import env from "dotenv";

env.config();

const config: HardhatUserConfig = {
	solidity: {
		version: "0.8.28",
		settings: {
			optimizer: {
				enabled: true,
				runs: 200,
			},
			viaIR: true,
		},
	},
	networks: {
		hardhat: {
			forking: {
				url: process.env.INFURA_URL || "",
			},
		},
		sepolia: {
			url: process.env.INFURA_URL || "",
			accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
			gasPrice: "auto",
			timeout: 120000,
		},
	},
	etherscan: {
		apiKey: process.env.ETHERSCAN_API_KEY || "",
	},
	sourcify: {
		enabled: true,
	},
};
export default config;
