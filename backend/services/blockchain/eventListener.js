import { ethers } from 'ethers';
import { getProvider, config } from './config.js';
import { getLendingPoolContract } from './contract.js';
import {
    handleDeposit,
    handleWithdraw,
    handleBorrow,
    handleRepay,
    handleCollateralSeized,
    handleAccrue,
    handleMarketSupported,
    handleMarketUnsupported
} from './eventHandlers.js';

/**
 * Event listener class for LendingPool contract
 */
class EventListener {
    constructor() {
        this.provider = null;
        this.contract = null;
        this.isListening = false;
        this.eventHandlers = new Map();
        this.setupEventHandlers();
    }

    /**
     * Setup event handlers mapping
     */
    setupEventHandlers() {
        this.eventHandlers.set('Deposit', handleDeposit);
        this.eventHandlers.set('Withdraw', handleWithdraw);
        this.eventHandlers.set('Borrow', handleBorrow);
        this.eventHandlers.set('Repay', handleRepay);
        this.eventHandlers.set('CollateralSeized', handleCollateralSeized);
        this.eventHandlers.set('Accrue', handleAccrue);
        this.eventHandlers.set('MarketSupported', handleMarketSupported);
        this.eventHandlers.set('MarketUnsupported', handleMarketUnsupported);
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
            
            this.contract = getLendingPoolContract(this.provider);
            
            const network = await this.provider.getNetwork();
            console.log(`✅ Connected to network: ${network.name} (chainId: ${network.chainId})`);
            console.log(`✅ LendingPool contract: ${await this.contract.getAddress()}`);
            
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

        if (!this.provider || !this.contract) {
            await this.initialize();
        }

        try {
            console.log('Starting event listeners...');
            
            // Set up listeners for each event
            for (const [eventName, handler] of this.eventHandlers) {
                this.contract.on(eventName, async (...args) => {
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
                
                console.log(`   ✓ Listening to ${eventName}`);
            }
            
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
            this.contract.removeAllListeners();
            
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
            contract: this.contract ? await this.contract.getAddress() : null,
            eventsMonitored: Array.from(this.eventHandlers.keys())
        };
    }

    /**
     * Sync past events (historical data)
     * @param {number} fromBlock - Starting block number
     * @param {number} toBlock - Ending block number (default: latest)
     */
    async syncPastEvents(fromBlock, toBlock = 'latest') {
        // Use HTTP provider for historical sync (more reliable than WebSocket)
        const httpProvider = getProvider(false);
        const syncContract = getLendingPoolContract(httpProvider);

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
                
                // Query all events for this batch
                for (const [eventName, handler] of this.eventHandlers) {
                    try {
                        const filter = syncContract.filters[eventName]();
                        const events = await syncContract.queryFilter(filter, start, end);
                        
                        for (const event of events) {
                            const block = await httpProvider.getBlock(event.blockNumber);
                            await handler(event, block.timestamp);
                        }
                        
                        if (events.length > 0) {
                            console.log(`Found ${events.length} ${eventName} events`);
                        }
                    } catch (error) {
                        console.error(`Error syncing ${eventName}:`, error.message);
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
