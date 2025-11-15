import { User_Asset } from "../models/index.js";
import { ethers } from "ethers";

/**
 * Get all user-asset associations for a specific user
 * @param {string} userAddress - Ethereum address of the user
 * @returns {Promise<User_Asset[]>} Array of user-asset instances
 * @throws {Error} If address is invalid
 */
export const getAssetsByUser = async (userAddress) => {
    if (!userAddress) {
        throw new Error('User address is required');
    }
    if (!ethers.isAddress(userAddress) || userAddress === ethers.ZeroAddress) {
        throw new Error('Invalid Ethereum address');
    }  
    try {
        return await User_Asset.findAll({ where: { userAddress } });
    } catch (error) {
        throw new Error(`Failed to fetch user assets: ${error.message}`);
    }
};

/**
 * Get all user-asset associations for a specific asset
 * @param {string} assetAddress - Ethereum address of the asset
 * @returns {Promise<User_Asset[]>} Array of user-asset instances
 * @throws {Error} If address is invalid
 */
export const getUserAssetsByAsset = async (assetAddress) => {
    if (!assetAddress) {
        throw new Error('Asset address is required');
    }
    if (!ethers.isAddress(assetAddress) || assetAddress === ethers.ZeroAddress) {
        throw new Error('Invalid Ethereum address');
    }  
    try {
        return await User_Asset.findAll({ where: { assetAddress } });
    } catch (error) {
        throw new Error(`Failed to fetch user assets: ${error.message}`);
    }
};

/**
 * Get specific user-asset association
 * @param {string} userAddress - Ethereum address of the user
 * @param {string} assetAddress - Ethereum address of the asset
 * @returns {Promise<User_Asset|null>} User-asset instance or null
 * @throws {Error} If addresses are invalid
 */
export const getUserAsset = async (userAddress, assetAddress) => {
    if (!userAddress || !assetAddress) {
        throw new Error('Both user and asset addresses are required');
    }
    if (!ethers.isAddress(userAddress) || userAddress === ethers.ZeroAddress) {
        throw new Error('Invalid Ethereum user address');
    }
    if (!ethers.isAddress(assetAddress) || assetAddress === ethers.ZeroAddress) {
        throw new Error('Invalid Ethereum asset address');
    }  
    try {
        return await User_Asset.findOne({ 
            where: { userAddress, assetAddress } 
        });
    } catch (error) {
        throw new Error(`Failed to fetch user asset: ${error.message}`);
    }
};

/**
 * Create a new user-asset association
 * @param {Object} data - User-asset data
 * @param {string} data.userAddress - User Ethereum address
 * @param {string} data.assetAddress - Asset Ethereum address
 * @param {string|number} data.deposited - Deposited amount (optional, default: '0')
 * @param {string|number} data.borrowed - Borrowed amount (optional, default: '0')
 * @param {string|number} data.depositIndexSnapShot - Deposit index snapshot (optional, default: '1000000000000000000')
 * @param {string|number} data.borrowIndexSnapShot - Borrow index snapshot (optional, default: '1000000000000000000')
 * @returns {Promise<User_Asset>} Created user-asset instance
 * @throws {Error} If input is invalid or association already exists
 */
export const createUserAsset = async (data) => {
    const { 
        userAddress, 
        assetAddress, 
        deposited = '0', 
        borrowed = '0'
    } = data;
    
    if (!userAddress || !assetAddress) {
        throw new Error('Both user and asset addresses are required');
    }
    if (!ethers.isAddress(userAddress) || userAddress === ethers.ZeroAddress) {
        throw new Error('Invalid Ethereum user address');
    }
    if (!ethers.isAddress(assetAddress) || assetAddress === ethers.ZeroAddress) {
        throw new Error('Invalid Ethereum asset address');
    }  
    
    try {
        // Check if association already exists
        const existing = await User_Asset.findOne({ 
            where: { userAddress, assetAddress } 
        });
        if (existing) {
            throw new Error('User-asset association already exists');
        }
        
        return await User_Asset.create({
            userAddress,
            assetAddress,
            deposited,
            borrowed
        });
    } catch (error) {
        if (error.message === 'User-asset association already exists') {
            throw error;
        }
        if (error.name === 'SequelizeUniqueConstraintError') {
            throw new Error('User-asset association already exists');
        }
        throw new Error(`Failed to create user asset: ${error.message}`);
    }   
};

/**
 * Update user-asset balances (deposited and/or borrowed)
 * @param {string} userAddress - User Ethereum address
 * @param {string} assetAddress - Asset Ethereum address
 * @param {Object} updates - Fields to update
 * @param {string|number} updates.deposited - New deposited amount (optional)
 * @param {string|number} updates.borrowed - New borrowed amount (optional)
 * @param {string|number} updates.depositIndexSnapShot - New deposit index (optional)
 * @param {string|number} updates.borrowIndexSnapShot - New borrow index (optional)
 * @returns {Promise<User_Asset>} Updated user-asset instance
 * @throws {Error} If addresses are invalid or association not found
 */
export const updateUserAsset = async (userAddress, assetAddress, updates) => {
    if (!userAddress || !assetAddress) {
        throw new Error('Both user and asset addresses are required');
    }
    if (!ethers.isAddress(userAddress) || userAddress === ethers.ZeroAddress) {
        throw new Error('Invalid Ethereum user address');
    }
    if (!ethers.isAddress(assetAddress) || assetAddress === ethers.ZeroAddress) {
        throw new Error('Invalid Ethereum asset address');
    }
    if (!updates || Object.keys(updates).length === 0) {
        throw new Error('No update fields provided');
    }
    
    try {
        const userAsset = await User_Asset.findOne({ 
            where: { userAddress, assetAddress } 
        });
        if (!userAsset) {
            throw new Error('User-asset association not found');
        }
        
        // Update only provided fields
        if (updates.deposited !== undefined) userAsset.deposited = updates.deposited;
        if (updates.borrowed !== undefined) userAsset.borrowed = updates.borrowed;
        
        await userAsset.save();
        return userAsset;
    } catch (error) {
        if (error.message === 'User-asset association not found') {
            throw error;
        }
        throw new Error(`Failed to update user asset: ${error.message}`);
    }   
};

/**
 * Get or create user-asset association (idempotent operation)
 * @param {Object} data - User-asset data
 * @returns {Promise<{userAsset: User_Asset, created: boolean}>} User-asset instance and creation flag
 * @throws {Error} If input is invalid
 */
export const getOrCreateUserAsset = async (data) => {
    const { 
        userAddress, 
        assetAddress, 
        deposited = '0', 
        borrowed = '0',
    } = data;
    
    if (!userAddress || !assetAddress) {
        throw new Error('Both user and asset addresses are required');
    }
    if (!ethers.isAddress(userAddress) || userAddress === ethers.ZeroAddress) {
        throw new Error('Invalid Ethereum user address');
    }
    if (!ethers.isAddress(assetAddress) || assetAddress === ethers.ZeroAddress) {
        throw new Error('Invalid Ethereum asset address');
    }
    
    try {
        const [userAsset, created] = await User_Asset.findOrCreate({
            where: { userAddress, assetAddress },
            defaults: { 
                userAddress, 
                assetAddress, 
                deposited, 
                borrowed
            }
        });
        return { userAsset, created };
    } catch (error) {
        throw new Error(`Failed to get or create user asset: ${error.message}`);
    }
};

/**
 * Delete user-asset association
 * @param {string} userAddress - User Ethereum address
 * @param {string} assetAddress - Asset Ethereum address
 * @returns {Promise<boolean>} True if deleted, false if not found
 * @throws {Error} If addresses are invalid
 */
export const deleteUserAsset = async (userAddress, assetAddress) => {
    if (!userAddress || !assetAddress) {
        throw new Error('Both user and asset addresses are required');
    }
    if (!ethers.isAddress(userAddress) || userAddress === ethers.ZeroAddress) {
        throw new Error('Invalid Ethereum user address');
    }
    if (!ethers.isAddress(assetAddress) || assetAddress === ethers.ZeroAddress) {
        throw new Error('Invalid Ethereum asset address');
    }
    
    try {
        const deleted = await User_Asset.destroy({ 
            where: { userAddress, assetAddress } 
        });
        return deleted > 0;
    } catch (error) {
        throw new Error(`Failed to delete user asset: ${error.message}`);
    }
};