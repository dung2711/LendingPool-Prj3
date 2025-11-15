import { Asset } from "../models/index.js";
import { ethers } from "ethers";

/**
 * Get asset by Ethereum address
 * @param {string} address - Ethereum address
 * @returns {Promise<Asset|null>} Asset instance or null if not found
 * @throws {Error} If address is invalid
 */
export const getAssetByAddress = async (address) => {
    if (!address) {
        throw new Error('Address is required');
    }
    if (!ethers.isAddress(address) || address === ethers.ZeroAddress) {
        throw new Error('Invalid Ethereum address');
    }
    try {
        return await Asset.findByPk(address);
    } catch (error) {
        throw new Error(`Failed to fetch asset: ${error.message}`);
    }
};

/**
 * Get all assets
 * @returns {Promise<Asset[]>} Array of asset instances
 * @throws {Error} If fetching fails
 */
export const getAllAssets = async () => {
    try {
        return await Asset.findAll();
    } catch (error) {
        throw new Error(`Failed to fetch assets: ${error.message}`);
    }
};

/**
 * Create a new asset
 * @param {Object} assetData - Asset data
 * @param {string} assetData.address - Ethereum address of the asset
 * @param {string} assetData.name - Name of the asset
 * @param {string} assetData.symbol - Symbol of the asset
 * @param {number} assetData.decimals - Decimals of the asset
 * @returns {Promise<Asset>} Created asset instance
 * @throws {Error} If input is invalid or asset already exists
 */
export const createAsset = async (assetData) => {
    const { address, name, symbol, decimals } = assetData;

    if (!address || !name || !symbol || decimals === undefined) {
        throw new Error('All asset fields are required');
    }
    if (!ethers.isAddress(address) || address === ethers.ZeroAddress) {
        throw new Error('Invalid Ethereum address');
    }

    try {
        // Check if asset already exists
        const existingAsset = await Asset.findByPk(address);
        if (existingAsset) {
            throw new Error('Asset already exists');
        }

        return await Asset.create({
            address,
            name,
            symbol,
            decimals
        });
    } catch (error) {
        // Re-throw custom errors
        if (error.message === 'Asset already exists') {
            throw error;
        }
        // Handle Sequelize unique constraint violations
        if (error.name === 'SequelizeUniqueConstraintError') {
            throw new Error('Asset already exists');
        }
        throw new Error(`Failed to create asset: ${error.message}`);
    }   
};

export const updateAssetSupportStatus = async (address, isSupported) => {
    if (!address) {
        throw new Error('Address is required');
    }
    if (!ethers.isAddress(address) || address === ethers.ZeroAddress) {
        throw new Error('Invalid Ethereum address');
    }
    if (typeof isSupported !== 'boolean') {
        throw new Error('isSupported must be a boolean');
    }
    try {
        const asset = await Asset.findByPk(address);
        if (!asset) {
            throw new Error('Asset not found');
        }
        asset.isSupported = isSupported;
        await asset.save();
        return asset;
    } catch (error) {
        if (error.message === 'Asset not found') {
            throw error;
        }
        throw new Error(`Failed to update asset: ${error.message}`);
    }
};

export const updateAssetBalances = async (address, totalDeposits, totalBorrows) => {
    if (!address) {
        throw new Error('Address is required');
    }
    if (!ethers.isAddress(address) || address === ethers.ZeroAddress) {
        throw new Error('Invalid Ethereum address');
    }
    if (totalDeposits === undefined || totalBorrows === undefined) {
        throw new Error('All balance fields are required');
    }
    try {
        const asset = await Asset.findByPk(address);
        if (!asset) {
            throw new Error('Asset not found');
        }
        asset.totalDeposits = totalDeposits;
        asset.totalBorrows = totalBorrows;
        await asset.save();
        return asset;
    } catch (error) {
        if (error.message === 'Asset not found') {
            throw error;
        }
        throw new Error(`Failed to update asset balances: ${error.message}`);
    }
};

export const deleteAsset = async (address) => {
    if (!address) {
        throw new Error('Address is required');
    }
    if (!ethers.isAddress(address) || address === ethers.ZeroAddress) {
        throw new Error('Invalid Ethereum address');
    }
    try {
        const deleted = await Asset.destroy({ where: { address } });
        return deleted > 0;
    } catch (error) {
        throw new Error(`Failed to delete asset: ${error.message}`);
    }
};

/**
 * Get or create asset (idempotent operation)
 * @param {Object} assetData - Asset data
 * @returns {Promise<{asset: Asset, created: boolean}>} Asset instance and creation flag
 * @throws {Error} If input is invalid
 */
export const getOrCreateAsset = async (assetData) => {
    const { address, name, symbol, decimals } = assetData;
    
    if (!address || !name || !symbol || decimals === undefined) {
        throw new Error('All asset fields are required');
    }
    if (!ethers.isAddress(address) || address === ethers.ZeroAddress) {
        throw new Error('Invalid Ethereum address');
    }
    
    try {
        const [asset, created] = await Asset.findOrCreate({
            where: { address },
            defaults: { address, name, symbol, decimals }
        });
        return { asset, created };
    } catch (error) {
        throw new Error(`Failed to get or create asset: ${error.message}`);
    }
};