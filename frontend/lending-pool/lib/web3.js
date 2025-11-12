import { lendingPoolABI, myOracleABI, liquidationABI, priceRouterABI, myTokenABI, interestRateModelABI } 
    from "../../../contracts/abis.js";

import {ethers} from 'ethers';

const ERC20_ABI = [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function allowance(address owner, address spender) external view returns (uint256)",
    "function balanceOf(address account) external view returns (uint256)",
    "function transfer(address recipient, uint256 amount) external returns (bool)",
    "function transferFrom(address sender, address recipient, uint256 amount) external returns (bool)",
    "function decimals() external view returns (uint8)",
    "function symbol() external view returns (string memory)"
];

const LENDING_POOL_ADDRESS = process.env.NEXT_PUBLIC_LENDING_POOL_ADDRESS;
const MY_ORACLE_ADDRESS = process.env.NEXT_PUBLIC_MY_ORACLE_ADDRESS;
const LIQUIDATION_ADDRESS = process.env.NEXT_PUBLIC_LIQUIDATION_ADDRESS;
const PRICE_ROUTER_ADDRESS = process.env.NEXT_PUBLIC_PRICE_ROUTER_ADDRESS;
const MY_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_MY_TOKEN_ADDRESS;
const INTEREST_RATE_MODEL_ADDRESS = process.env.NEXT_PUBLIC_INTEREST_RATE_MODEL_ADDRESS;

const getContract = async (contractAddress, contractABI) => {
    let provider;

    if (typeof window !== "undefined" && window.ethereum) {
        provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        return new ethers.Contract(contractAddress, contractABI, signer);
    } else {
        provider = ethers.getDefaultProvider();
        return new ethers.Contract(contractAddress, contractABI, provider);
    }
};

export const getLendingPoolContract = () => {
    return getContract(LENDING_POOL_ADDRESS, lendingPoolABI);
};

export const getMyOracleContract = () => {
    return getContract(MY_ORACLE_ADDRESS, myOracleABI);
};

export const getLiquidationContract = () => {
    return getContract(LIQUIDATION_ADDRESS, liquidationABI);
};

export const getPriceRouterContract = () => {
    return getContract(PRICE_ROUTER_ADDRESS, priceRouterABI);
};

export const getInterestRateModelContract = () => {
    return getContract(INTEREST_RATE_MODEL_ADDRESS, interestRateModelABI);
};

export const getToken = (tokenAddress) => {
    return getContract(tokenAddress, ERC20_ABI);
};
