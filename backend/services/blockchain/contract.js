import { ethers } from 'ethers';
import { getProvider, config } from './config.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import ABI from contracts folder
let lendingPoolABI;
let liquidationABI;
let priceRouterABI;
try {
    // Try dynamic import first
    const abisPath = path.resolve(__dirname, '../../../contracts/abis.js');
    if (fs.existsSync(abisPath)) {
        const abisModule = await import(abisPath);
        lendingPoolABI = abisModule.lendingPoolABI;
        liquidationABI = abisModule.liquidationABI;
        priceRouterABI = abisModule.priceRouterABI;
    } else {
        throw new Error('ABIs file not found at expected path');
    }
} catch (error) {
    console.error('Failed to import ABI:', error);
    throw new Error('LendingPool ABI not found. Ensure contracts/abis.js exports lendingPoolABI');
}

const ERC20_ABI = [
    "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)"
];

/**
 * Get LendingPool contract instance
 * @param {ethers.Provider} provider - Optional provider instance
 * @returns {ethers.Contract}
 */
export const getLendingPoolContract = (provider = null) => {
    if (!provider) {
        provider = getProvider();
    }
    
    return new ethers.Contract(
        config.lendingPoolAddress,
        lendingPoolABI,
        provider
    );
};

export const getLiquidationContract = (provider = null) => {
    if (!provider) {
        provider = getProvider();
    }
    
    return new ethers.Contract(
        config.liquidationAddress,
        liquidationABI,
        provider
    );
};

/**
 * Get PriceRouter contract instance
 * @param {ethers.Provider} provider - Optional provider instance
 * @returns {ethers.Contract}
 */
export const getPriceRouterContract = (provider = null) => {
    if (!provider) {
        provider = getProvider();
    }
    
    return new ethers.Contract(
        config.priceRouterAddress,
        priceRouterABI,
        provider
    );
};

/**
 * Get ERC20 contract instance
 * @param {string} tokenAddress - ERC20 token address
 * @param {ethers.Provider} provider - Optional provider instance
 * @returns {ethers.Contract}
 */

export const getERC20Contract = (tokenAddress, provider = null) => {
    if (!provider) {
        provider = getProvider();
    }
    
    return new ethers.Contract(
        tokenAddress,
        ERC20_ABI,
        provider
    );
};

/**
 * Get contract with signer (for write operations)
 * @param {ethers.Signer} signer - Signer instance
 * @returns {ethers.Contract}
 */
export const getLendingPoolContractWithSigner = (signer) => {
    return new ethers.Contract(
        config.lendingPoolAddress,
        lendingPoolABI,
        signer
    );
};

/**
 * Parse event from contract
 * @param {ethers.Contract} contract - Contract instance
 * @param {string} eventName - Event name
 * @param {ethers.Log} log - Event log
 * @returns {Object} Parsed event data
 */
export const parseEvent = (contract, eventName, log) => {
    try {
        const parsedLog = contract.interface.parseLog({
            topics: log.topics,
            data: log.data
        });
        
        return {
            name: parsedLog.name,
            args: parsedLog.args,
            eventSignature: parsedLog.signature,
            transactionHash: log.transactionHash,
            blockNumber: log.blockNumber,
            logIndex: log.logIndex
        };
    } catch (error) {
        console.error(`Failed to parse ${eventName} event:`, error);
        return null;
    }
};

/**
 * Get all event names from contract
 * @returns {string[]} Array of event names
 */
export const getEventNames = () => {
    const contract = getLendingPoolContract();
    return Object.keys(contract.interface.events);
};
