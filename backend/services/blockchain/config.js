import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Blockchain configuration
 */
export const config = {
    // RPC URL - supports HTTP and WebSocket
    rpcUrl: process.env.RPC_URL || 'http://localhost:8545',
    wsUrl: process.env.WS_URL || 'ws://localhost:8545',
    
    // Contract addresses
    lendingPoolAddress: process.env.LENDING_POOL_ADDRESS,
    
    // Network configuration
    chainId: parseInt(process.env.CHAIN_ID || '31337'),
    networkName: process.env.NETWORK_NAME || 'localhost',
    
    // Sync configuration
    sync: {
        batchSize: parseInt(process.env.SYNC_BATCH_SIZE || '1000')
    }
};

/**
 * Get provider instance
 * @param {boolean} useWebSocket - Whether to use WebSocket provider
 * @returns {ethers.Provider}
 */
export const getProvider = (useWebSocket = false) => {
    try {
        if (useWebSocket && config.wsUrl) {
            return new ethers.WebSocketProvider(config.wsUrl);
        }
        return new ethers.JsonRpcProvider(config.rpcUrl);
    } catch (error) {
        console.error('Failed to create provider:', error);
        throw error;
    }
};

/**
 * Validate configuration
 */
export const validateConfig = () => {
    const required = ['lendingPoolAddress'];
    const missing = required.filter(key => !config[key]);
    
    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
    
    console.log('✅ Blockchain configuration validated');
    console.log(`   Network: ${config.networkName} (Chain ID: ${config.chainId})`);
    console.log(`   RPC: ${config.rpcUrl}`);
    console.log(`   LendingPool: ${config.lendingPoolAddress}`);
};
