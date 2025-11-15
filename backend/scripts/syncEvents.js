#!/usr/bin/env node

/**
 * CLI tool for blockchain event synchronization
 * Usage: node scripts/syncEvents.js [fromBlock] [toBlock]
 */

import dotenv from 'dotenv';
import { syncHistoricalEvents } from '../services/blockchain/index.js';
import { getProvider } from '../services/blockchain/config.js';

// Load environment variables
dotenv.config();

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
    console.log(`
📡 Blockchain Event Sync CLI

Usage:
  node scripts/syncEvents.js [fromBlock] [toBlock]

Arguments:
  fromBlock  Starting block number (default: 0)
  toBlock    Ending block number (default: latest)

Examples:
  # Sync all events from genesis
  node scripts/syncEvents.js 0

  # Sync specific range
  node scripts/syncEvents.js 1000 2000

  # Sync from block 5000 to latest
  node scripts/syncEvents.js 5000 latest

Environment Variables:
  LENDING_POOL_ADDRESS  Contract address (required)
  RPC_URL               RPC endpoint (required)
  SYNC_BATCH_SIZE       Batch size for syncing (default: 1000)
    `);
    process.exit(0);
}

const provider = getProvider(false);
const fromBlock = (await provider.getBlockNumber()) - 20000;
const toBlock = args[1] === 'latest' ? 'latest' : parseInt(args[1]) || 'latest';

console.log(`\n🔄 Starting event synchronization...`);
console.log(`   From Block: ${fromBlock}`);
console.log(`   To Block: ${toBlock}\n`);

try {
    await syncHistoricalEvents(fromBlock, toBlock);
    console.log('\n✅ Synchronization completed successfully!\n');
    process.exit(0);
} catch (error) {
    console.error('\n❌ Synchronization failed:', error.message);
    console.error(error);
    process.exit(1);
}
