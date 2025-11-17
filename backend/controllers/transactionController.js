import { Transaction } from "../models/index.js";
import { ethers } from "ethers";

/**
 * Get all transactions for a specific user
 * @param {string} userAddress - Ethereum address of the user
 * @returns {Promise<Transaction[]>} Array of transaction instances
 * @throws {Error} If address is invalid
 */
export const getTransactionsByUser = async (userAddress) => {
    if (!userAddress) {
        throw new Error('User address is required');
    }
    if (!ethers.isAddress(userAddress) || userAddress === ethers.ZeroAddress) {
        throw new Error('Invalid Ethereum address');
    }
    try {
        return await Transaction.findAll({ 
            where: { userAddress },
            order: [['timestamp', 'DESC']]
        });
    } catch (error) {
        throw new Error(`Failed to fetch transactions: ${error.message}`);
    }
};

/**
 * Get all transactions for a specific asset
 * @param {string} assetAddress - Ethereum address of the asset
 * @returns {Promise<Transaction[]>} Array of transaction instances
 * @throws {Error} If address is invalid
 */
export const getTransactionsByAsset = async (assetAddress) => {
    if (!assetAddress) {
        throw new Error('Asset address is required');
    }
    if (!ethers.isAddress(assetAddress) || assetAddress === ethers.ZeroAddress) {
        throw new Error('Invalid Ethereum address');
    }
    try {
        return await Transaction.findAll({ 
            where: { assetAddress },
            order: [['timestamp', 'DESC']]
        });
    } catch (error) {
        throw new Error(`Failed to fetch transactions: ${error.message}`);
    }
};

/**
 * Get transaction by hash
 * @param {string} hash - Transaction hash
 * @returns {Promise<Transaction|null>} Transaction instance or null
 * @throws {Error} If hash is invalid
 */
export const getTransactionByHash = async (hash) => {
    if (!hash) {
        throw new Error('Transaction hash is required');
    }
    if (!hash.startsWith('0x') || hash.length !== 66) {
        throw new Error('Invalid transaction hash format');
    }
    try {
        return await Transaction.findByPk(hash);
    } catch (error) {
        throw new Error(`Failed to fetch transaction: ${error.message}`);
    }
};

/**
 * Get all transactions with pagination and optional filters
 * @param {Object} options - Query options
 * @param {number} options.limit - Max number of results (default: 100)
 * @param {number} options.offset - Number of results to skip (default: 0)
 * @param {string} options.type - Filter by transaction type
 * @returns {Promise<{transactions: Transaction[], total: number}>} Transactions and total count
 */
export const getAllTransactions = async ({ limit = 100, offset = 0, type = null } = {}) => {
    try {
        const where = {};
        if (type) {
            where.type = type;
        }
        
        const { count, rows } = await Transaction.findAndCountAll({
            where,
            limit: Math.min(limit, 1000),
            offset,
            order: [['timestamp', 'DESC']]
        });
        return { transactions: rows, total: count };
    } catch (error) {
        throw new Error(`Failed to fetch transactions: ${error.message}`);
    }
};

/**
 * Create a new transaction
 * @param {Object} txData - Transaction data
 * @param {string} txData.hash - Transaction hash (required, primary key)
 * @param {string} txData.userAddress - User Ethereum address
 * @param {string} txData.assetAddress - Asset Ethereum address
 * @param {string} txData.type - Transaction type (deposit, borrow, repay, withdraw, liquidated)
 * @param {string|number} txData.amount - Transaction amount
 * @param {Date|string} txData.timestamp - Transaction timestamp
 * @returns {Promise<Transaction>} Created transaction instance
 * @throws {Error} If input is invalid or transaction already exists
 */
export const createTransaction = async (txData) => {
    const { hash, userAddress, assetAddress, type, amount, amountUSD, blockNumber, timestamp } = txData;
    
    if (!hash || !userAddress || !assetAddress || !type || !amount || !amountUSD || !blockNumber || !timestamp) {
        throw new Error('All transaction fields are required (hash, userAddress, assetAddress, type, amount, blockNumber, timestamp)');
    }
    if (!hash.startsWith('0x') || hash.length !== 66) {
        throw new Error('Invalid transaction hash format');
    }
    if (!ethers.isAddress(userAddress) || userAddress === ethers.ZeroAddress) {
        throw new Error('Invalid Ethereum user address');
    }
    if (!ethers.isAddress(assetAddress) || assetAddress === ethers.ZeroAddress) {
        throw new Error('Invalid Ethereum asset address');
    }
    
    const validTypes = ['deposit', 'borrow', 'repay', 'withdraw', 'liquidated'];
    if (!validTypes.includes(type)) {
        throw new Error(`Invalid transaction type. Must be one of: ${validTypes.join(', ')}`);
    }
    
    try {
        // Check if transaction already exists
        const existingTx = await Transaction.findByPk(hash);
        if (existingTx) {
            throw new Error('Transaction already exists');
        }
        
        return await Transaction.create({
            hash,
            userAddress,
            assetAddress,
            type,
            amount,
            amountUSD,
            blockNumber,
            timestamp
        });
    } catch (error) {
        if (error.message === 'Transaction already exists') {
            throw error;
        }
        if (error.name === 'SequelizeUniqueConstraintError') {
            throw new Error('Transaction already exists');
        }
        throw new Error(`Failed to create transaction: ${error.message}`);
    }
};

/**
 * Get or create transaction (idempotent operation)
 * @param {Object} txData - Transaction data
 * @returns {Promise<{transaction: Transaction, created: boolean}>} Transaction instance and creation flag
 * @throws {Error} If input is invalid
 */
export const getOrCreateTransaction = async (txData) => {
    const { hash, userAddress, assetAddress, type, amount, amountUSD, blockNumber, timestamp } = txData;
    
    if (!hash || !userAddress || !assetAddress || !type || !amount || !amountUSD || !timestamp) {
        throw new Error('All transaction fields are required');
    }
    if (!hash.startsWith('0x') || hash.length !== 66) {
        throw new Error('Invalid transaction hash format');
    }
    if (!ethers.isAddress(userAddress) || userAddress === ethers.ZeroAddress) {
        throw new Error('Invalid Ethereum user address');
    }
    if (!ethers.isAddress(assetAddress) || assetAddress === ethers.ZeroAddress) {
        throw new Error('Invalid Ethereum asset address');
    }
    
    try {
        const [transaction, created] = await Transaction.findOrCreate({
            where: { hash },
            defaults: { hash, userAddress, assetAddress, type, amount, amountUSD, blockNumber, timestamp }
        });
        return { transaction, created };
    } catch (error) {
        throw new Error(`Failed to get or create transaction: ${error.message}`);
    }
};