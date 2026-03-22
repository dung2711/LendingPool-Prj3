import { ethers } from "ethers";
import {
  interestRateModelABI,
  lendingPoolABI,
  liquidationABI,
  myOracleABI,
  priceRouterABI,
} from "../../shared/abis.js";

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function transfer(address recipient, uint256 amount) external returns (bool)",
  "function transferFrom(address sender, address recipient, uint256 amount) external returns (bool)",
  "function decimals() external view returns (uint8)",
  "function symbol() external view returns (string memory)",
];

const LENDING_POOL_ADDRESS = process.env.NEXT_PUBLIC_LENDING_POOL_ADDRESS || "";
const MY_ORACLE_ADDRESS = process.env.NEXT_PUBLIC_MY_ORACLE_ADDRESS || "";
const LIQUIDATION_ADDRESS = process.env.NEXT_PUBLIC_LIQUIDATION_ADDRESS || "";
const PRICE_ROUTER_ADDRESS = process.env.NEXT_PUBLIC_PRICE_ROUTER_ADDRESS || "";
const INTEREST_RATE_MODEL_ADDRESS =
  process.env.NEXT_PUBLIC_INTEREST_RATE_MODEL_ADDRESS || "";

const getContract = async (
  contractAddress: string,
  contractABI: ethers.InterfaceAbi,
): Promise<ethers.Contract> => {
  if (typeof window !== "undefined" && window.ethereum) {
    const provider: ethers.BrowserProvider = new ethers.BrowserProvider(
      window.ethereum,
    );
    const signer = await provider.getSigner();
    return new ethers.Contract(contractAddress, contractABI, signer);
  } else {
    const provider: ethers.Provider = ethers.getDefaultProvider();
    return new ethers.Contract(contractAddress, contractABI, provider);
  }
};

export const web3Service = {
  async getLendingPoolContract() {
    return await getContract(LENDING_POOL_ADDRESS, lendingPoolABI);
  },

  async getMyOracleContract() {
    return await getContract(MY_ORACLE_ADDRESS, myOracleABI);
  },

  async getLiquidationContract() {
    return await getContract(LIQUIDATION_ADDRESS, liquidationABI);
  },

  async getPriceRouterContract() {
    return await getContract(PRICE_ROUTER_ADDRESS, priceRouterABI);
  },

  async getInterestRateModelContract() {
    return await getContract(INTEREST_RATE_MODEL_ADDRESS, interestRateModelABI);
  },

  async getToken(tokenAddress: string) {
    return await getContract(tokenAddress, ERC20_ABI);
  },
};
