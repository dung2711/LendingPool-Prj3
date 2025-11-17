import { Liquidatable_Users } from "../models/index.js";

export const getAllLiquidatableUsers = async () => {
    try {
        return await Liquidatable_Users.findAll();
    } catch (error) {
        throw new Error(`Failed to fetch liquidatable users: ${error.message}`);
    }
};

export const createLiquidatableUser = async (userAddress) => {
    if (!userAddress) {
        throw new Error('User address is required');
    }

    try {
        return await Liquidatable_Users.create({ userAddress });

    } catch (error) {
        // Re-throw custom errors
        if (error.message === 'User is already marked as liquidatable') {
            throw error;
        }
        // Handle Sequelize unique constraint violations
        if (error.name === 'SequelizeUniqueConstraintError') {
            throw new Error('User is already marked as liquidatable');
        }
        throw new Error(`Failed to create liquidatable user: ${error.message}`);
    }
};

export const removeLiquidatableUser = async (userAddress) => {
    if (!userAddress) {
        throw new Error('User address is required');
    }

    try {
        const deleted = await Liquidatable_Users.destroy({ 
            where: { userAddress } 
        });
        return deleted > 0;
    } catch (error) {
        throw new Error(`Failed to remove liquidatable user: ${error.message}`);
    }
};

export const removeAllRows = async () => {
    try {
        await Liquidatable_Users.destroy({ where: {} });
    } catch (error) {
        throw new Error(`Failed to remove liquidatable users: ${error.message}`);
    }
};