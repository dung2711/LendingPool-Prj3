import eventListener from './eventListener.js';
import { validateConfig } from './config.js';

/**
 * Initialize blockchain services
 */
export const initializeBlockchainServices = async () => {
    try {
        console.log('\n🚀 Initializing blockchain services...\n');
        
        // Validate configuration
        validateConfig();
        
        // Initialize and start event listener
        await eventListener.initialize();
        await eventListener.start();
        
        console.log('\n✅ Blockchain services initialized successfully\n');
        
        return true;
    } catch (error) {
        console.error('\n❌ Failed to initialize blockchain services:', error);
        return false;
    }
};

/**
 * Stop blockchain services
 */
export const stopBlockchainServices = async () => {
    try {
        console.log('\n🛑 Stopping blockchain services...\n');
        
        await eventListener.stop();
        
        console.log('\n✅ Blockchain services stopped\n');
    } catch (error) {
        console.error('\n❌ Failed to stop blockchain services:', error);
    }
};

/**
 * Get blockchain services status
 */
export const getBlockchainStatus = async () => {
    return await eventListener.getStatus();
};

/**
 * Get event listener instance for subscribing to events
 */
export const getEventListener = () => {
    return eventListener;
};

/**
 * Sync historical events
 * @param {number} fromBlock - Starting block number
 * @param {number} toBlock - Ending block number (default: latest)
 */
export const syncHistoricalEvents = async (fromBlock, toBlock = 'latest') => {
    return await eventListener.syncPastEvents(fromBlock, toBlock);
};
