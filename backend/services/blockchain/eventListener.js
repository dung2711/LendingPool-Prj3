import { ethers } from 'ethers';
import { EventEmitter } from 'events';
import { getProvider, config } from './config.js';
import { getLendingPoolContract, getLiquidationContract } from './contract.js';
import {
    handleDeposit,
    handleWithdraw,
    handleBorrow,
    handleRepay,
    handleCollateralSeized,
    handleAccrue,
    handleMarketSupported,
    handleMarketUnsupported,
    handleCollateralFactorUpdated,
    handleLiquidationParamsUpdated,
    calculateLiquidatableUsers
} from './eventHandlers.js';

/**
 * Event listener class for LendingPool contract
 */
class EventListener extends EventEmitter {
    constructor() {
        super();
        this.provider = null;
        this.lendingPoolContract = null;
        this.liquidationContract = null;
        this.isListening = false;
        this.lendingPoolEventHandlers = new Map();
        this.liquidationEventHandlers = new Map();
        this.lastLiquidatableCheck = 0;
        this.liquidatableCheckInterval = 10; // Check every 10 blocks
        this.lastLiquidatableUpdate = null;
        this.setupEventHandlers();
    }

    /**
     * Setup event handlers mapping
     */
    setupEventHandlers() {
        this.lendingPoolEventHandlers.set('Deposit', handleDeposit);
        this.lendingPoolEventHandlers.set('Withdraw', handleWithdraw);
        this.lendingPoolEventHandlers.set('Borrow', handleBorrow);
        this.lendingPoolEventHandlers.set('Repay', handleRepay);
        this.lendingPoolEventHandlers.set('CollateralSeized', handleCollateralSeized);
        this.lendingPoolEventHandlers.set('Accrue', handleAccrue);
        this.lendingPoolEventHandlers.set('MarketSupported', handleMarketSupported);
        this.lendingPoolEventHandlers.set('MarketUnsupported', handleMarketUnsupported);
        this.lendingPoolEventHandlers.set('CollateralFactorUpdated', handleCollateralFactorUpdated);
        this.liquidationEventHandlers.set('LiquidationParamsUpdated', handleLiquidationParamsUpdated);
    }

    /**
     * Initialize provider and contract
     */
    async initialize() {
        try {
            console.log('Initializing blockchain event listener...');
            
            // Try WebSocket first, fall back to HTTP
            try {
                this.provider = getProvider(true);
                await this.provider.getNetwork();
                console.log('Connected via WebSocket');
            } catch (error) {
                console.log('⚠️  WebSocket failed, using HTTP provider');
                this.provider = getProvider(false);
            }
            
            this.lendingPoolContract = getLendingPoolContract(this.provider);
            this.liquidationContract = getLiquidationContract(this.provider);
            
            const network = await this.provider.getNetwork();
            console.log(`✅ Connected to network: ${network.name} (chainId: ${network.chainId})`);
            console.log(`✅ LendingPool contract: ${await this.lendingPoolContract.getAddress()}`);
            console.log(`✅ Liquidation contract: ${await this.liquidationContract.getAddress()}`);
            
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize event listener:', error);
            throw error;
        }
    }

    /**
     * Start listening to events
     */
    async start() {
        if (this.isListening) {
            console.log('⚠️  Event listener already running');
            return;
        }

        if (!this.provider || !this.lendingPoolContract || !this.liquidationContract) {
            await this.initialize();
        }

        try {
            console.log('Starting event listeners...');
            
            // Set up listeners for each event
            for (const [eventName, handler] of this.lendingPoolEventHandlers) {
                this.lendingPoolContract.on(eventName, async (...args) => {
                    try {
                        // Last argument is the event object
                        const event = args[args.length - 1];
                        
                        // Get block to extract timestamp
                        const block = await this.provider.getBlock(event.blockNumber);
                        
                        // Call the handler
                        await handler(event, block.timestamp);
                    } catch (error) {
                        console.error(`Error processing ${eventName} event:`, error);
                    }
                });
                
                console.log(`Listening to ${eventName}`);
            }
            for (const [eventName, handler] of this.liquidationEventHandlers) {
                this.liquidationContract.on(eventName, async (...args) => {
                    try {
                        // Last argument is the event object
                        const event = args[args.length - 1];
                        
                        // Get block to extract timestamp
                        const block = await this.provider.getBlock(event.blockNumber);
                        
                        // Call the handler
                        await handler(event, block.timestamp);
                    } catch (error) {
                        console.error(`Error processing ${eventName} event:`, error);
                    }
                });
                
                console.log(`Listening to ${eventName}`);
            }
            

            // Throttled liquidatable users calculation
            this.provider.on('block', async (blockNumber) => {
                try {
                    // Only calculate every N blocks to reduce load
                    if (blockNumber - this.lastLiquidatableCheck >= this.liquidatableCheckInterval) {
                        this.lastLiquidatableCheck = blockNumber;
                        console.log(`🔍 Checking liquidatable users at block ${blockNumber}...`);
                        
                        const liquidatableUsers = await calculateLiquidatableUsers();
                        this.lastLiquidatableUpdate = new Date();
                        
                        // Emit event for frontend notification (if using WebSocket)
                        this.emit('liquidatableUsersUpdated', {
                            users: liquidatableUsers,
                            blockNumber,
                            timestamp: this.lastLiquidatableUpdate
                        });
                        
                        console.log(`✅ Liquidatable users updated: ${liquidatableUsers.length} users found`);
                    }
                } catch (error) {
                    console.error('Error in liquidatable users check:', error);
                }
            });
            
            this.isListening = true;
            console.log('✅ All event listeners started');
        } catch (error) {
            console.error('❌ Failed to start event listeners:', error);
            throw error;
        }
    }

    /**
     * Stop listening to events
     */
    async stop() {
        if (!this.isListening) {
            console.log('⚠️  Event listener not running');
            return;
        }

        try {
            console.log('🛑 Stopping event listeners...');
            
            // Remove all listeners
            this.lendingPoolContract.removeAllListeners();
            this.liquidationContract.removeAllListeners();
            
            this.isListening = false;
            console.log('✅ Event listeners stopped');
        } catch (error) {
            console.error('❌ Failed to stop event listeners:', error);
            throw error;
        }
    }

    /**
     * Get listening status
     */
    async getStatus() {
        return {
            isListening: this.isListening,
            provider: this.provider ? 'connected' : 'disconnected',
            lendingPoolContract: this.lendingPoolContract ? await this.lendingPoolContract.getAddress() : null,
            liquidationContract: this.liquidationContract ? await this.liquidationContract.getAddress() : null,
            eventsMonitored: Array.from(this.lendingPoolEventHandlers.keys())
                .concat(Array.from(this.liquidationEventHandlers.keys())),
            lastLiquidatableUpdate: this.lastLiquidatableUpdate
        };
    }

    /**
     * Get last liquidatable users update timestamp
     */
    getLastLiquidatableUpdate() {
        return this.lastLiquidatableUpdate;
    }

    /**
     * Force liquidatable users calculation
     */
    async forceLiquidatableCheck() {
        console.log('🔄 Forcing liquidatable users check...');
        const liquidatableUsers = await calculateLiquidatableUsers();
        this.lastLiquidatableUpdate = new Date();
        this.emit('liquidatableUsersUpdated', {
            users: liquidatableUsers,
            timestamp: this.lastLiquidatableUpdate
        });
        return liquidatableUsers;
    }

    /**
     * Sync past events (historical data)
     * @param {number} fromBlock - Starting block number
     * @param {number} toBlock - Ending block number (default: latest)
     */
    async syncPastEvents(fromBlock, toBlock = 'latest') {
        // Use HTTP provider for historical sync (more reliable than WebSocket)
        const httpProvider = getProvider(false);
        const syncLendingPoolContract = getLendingPoolContract(httpProvider);
        const syncLiquidationContract = getLiquidationContract(httpProvider);

        try {
            console.log(`🔄 Syncing events from block ${fromBlock} to ${toBlock}...`);
            console.log(`   Using JsonRpcProvider for reliable historical queries`);
            
            const currentBlock = await httpProvider.getBlockNumber();
            const endBlock = toBlock === 'latest' ? currentBlock : toBlock;
            
            // Process in batches to avoid RPC limits
            const batchSize = config.sync.batchSize;
            let processedBlocks = 0;
            
            for (let start = fromBlock; start <= endBlock; start += batchSize) {
                const end = Math.min(start + batchSize - 1, endBlock);
                
                console.log(`   Processing blocks ${start} to ${end}...`);
                
                // Query LendingPool events
                for (const [eventName, handler] of this.lendingPoolEventHandlers) {
                    try {
                        const filter = syncLendingPoolContract.filters[eventName]();
                        const events = await syncLendingPoolContract.queryFilter(filter, start, end);
                        
                        for (const event of events) {
                            const block = await httpProvider.getBlock(event.blockNumber);
                            await handler(event, block.timestamp);
                        }
                        
                        if (events.length > 0) {
                            console.log(`   Found ${events.length} ${eventName} events (LendingPool)`);
                        }
                    } catch (error) {
                        console.error(`   Error syncing LendingPool ${eventName}:`, error.message);
                    }
                }
                
                // Query Liquidation events
                for (const [eventName, handler] of this.liquidationEventHandlers) {
                    try {
                        const filter = syncLiquidationContract.filters[eventName]();
                        const events = await syncLiquidationContract.queryFilter(filter, start, end);
                        
                        for (const event of events) {
                            const block = await httpProvider.getBlock(event.blockNumber);
                            await handler(event, block.timestamp);
                        }
                        
                        if (events.length > 0) {
                            console.log(`   Found ${events.length} ${eventName} events (Liquidation)`);
                        }
                    } catch (error) {
                        console.error(`   Error syncing Liquidation ${eventName}:`, error.message);
                    }
                }
                
                processedBlocks = end - fromBlock + 1;
                const progress = ((processedBlocks / (endBlock - fromBlock + 1)) * 100).toFixed(1);
                console.log(`   Progress: ${progress}% (${processedBlocks}/${endBlock - fromBlock + 1} blocks)`);
            }
            
            console.log(`✅ Sync completed! Processed ${processedBlocks} blocks`);
        } catch (error) {
            console.error('❌ Failed to sync past events:', error);
            throw error;
        }
    }
}

const eventListener = new EventListener();

export default eventListener;
