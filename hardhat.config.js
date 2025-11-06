import "@nomicfoundation/hardhat-toolbox";
import env from "dotenv";
env.config();

/** @type import('hardhat/config').HardhatUserConfig */
export default {
  solidity: {
    version: "0.8.28",
  },
  networks: {
    sepolia: {
      url: process.env.INFURA_URL || "",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      gasPrice: "auto", // 👈 let ethers pick a good gas price
      timeout: 120000,  // 120 seconds
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || "",
  },
  sourcify: {
  enabled: true
}

};
