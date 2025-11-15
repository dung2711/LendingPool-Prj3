import { User } from "../models/index.js";
import { ethers } from "ethers";

/**
 * Get user by Ethereum address
 * @param {string} address - Ethereum address
 * @returns {Promise<User|null>} User instance or null if not found
 * @throws {Error} If address is invalid
 */
export const getUserByAddress = async (address) => {
    if (!address) {
        throw new Error('Address is required');
    }
    if (!ethers.isAddress(address) || address === ethers.ZeroAddress) {
        throw new Error('Invalid Ethereum address');
    }
    try {
        return await User.findByPk(address);
    } catch (error) {
        throw new Error(`Failed to fetch user: ${error.message}`);
    }
};

/**
 * Create a new user with Ethereum address
 * @param {string} address - Ethereum address
 * @returns {Promise<User>} Created user instance
 * @throws {Error} If address is invalid or user already exists
 */
export const createUser = async (address) => {
    if (!address) {
        throw new Error('Address is required');
    }
    if (!ethers.isAddress(address) || address === ethers.ZeroAddress) {
        throw new Error('Invalid Ethereum address');
    }
    
    try {
        // Check if user already exists
        const existingUser = await User.findByPk(address);
        if (existingUser) {
            throw new Error('User already exists');
        }
        
        return await User.create({ address });
    } catch (error) {
        // Re-throw custom errors
        if (error.message === 'User already exists') {
            throw error;
        }
        // Handle Sequelize unique constraint violations
        if (error.name === 'SequelizeUniqueConstraintError') {
            throw new Error('User already exists');
        }
        throw new Error(`Failed to create user: ${error.message}`);
    }
};

/**
 * Get or create user by address (idempotent operation)
 * @param {string} address - Ethereum address
 * @returns {Promise<{user: User, created: boolean}>} User instance and creation flag
 * @throws {Error} If address is invalid
 */
export const getOrCreateUser = async (address) => {
    if (!address) {
        throw new Error('Address is required');
    }
    if (!ethers.isAddress(address) || address === ethers.ZeroAddress) {
        throw new Error('Invalid Ethereum address');
    }
    
    try {
        const [user, created] = await User.findOrCreate({
            where: { address },
            defaults: { address }
        });
        return { user, created };
    } catch (error) {
        throw new Error(`Failed to get or create user: ${error.message}`);
    }
};

/**
 * Get all users with optional pagination
 * @param {Object} options - Query options
 * @param {number} options.limit - Max number of results (default: 100)
 * @param {number} options.offset - Number of results to skip (default: 0)
 * @returns {Promise<{users: User[], total: number}>} Users and total count
 */
export const getAllUsers = async ({ limit = 100, offset = 0 } = {}) => {
    try {
        const { count, rows } = await User.findAndCountAll({
            limit: Math.min(limit, 1000), // Cap at 1000
            offset,
            order: [['joinedAt', 'DESC']]
        });
        return { users: rows, total: count };
    } catch (error) {
        throw new Error(`Failed to fetch users: ${error.message}`);
    }
};

/**
 * Delete user by address
 * @param {string} address - Ethereum address
 * @returns {Promise<boolean>} True if deleted, false if not found
 * @throws {Error} If address is invalid
 */
export const deleteUser = async (address) => {
    if (!address) {
        throw new Error('Address is required');
    }
    if (!ethers.isAddress(address) || address === ethers.ZeroAddress) {
        throw new Error('Invalid Ethereum address');
    }
    
    try {
        const deleted = await User.destroy({ where: { address } });
        return deleted > 0;
    } catch (error) {
        throw new Error(`Failed to delete user: ${error.message}`);
    }
};