import { ethers } from 'ethers';
import { 
    getOrCreateUser,
} from '../../controllers/userController.js';
import { getOrCreateTransaction, createTransaction } from '../../controllers/transactionController.js';
import { 
    getOrCreateUserAsset,
    updateUserAsset,
    getUserAsset,
    getAssetsByUser,
    getAllAssetsUsers
} from '../../controllers/userAssetController.js';
import { 
    updateAssetBalances, 
    getOrCreateAsset, 
    getAssetByAddress,
    updateAssetSupportStatus 
} from '../../controllers/assetController.js';
import { getAllLiquidatableUsers, createLiquidatableUser, removeLiquidatableUser, removeAllRows } from "../../controllers/liquidatableUsersController.js"
import { getMarketConfigByAddress, createMarketConfig, updateMarketConfig } from '../../controllers/marketConfigController.js';
import { getLendingPoolContract, getERC20Contract, getPriceRouterContract, getLiquidationContract } from './contract.js';


const lendingPoolContract = getLendingPoolContract();
const priceRouterContract = getPriceRouterContract();
const liquidationContract = getLiquidationContract();

/**
 * Handle Deposit event
 * Event signature: Deposit(address indexed user, address indexed asset, uint256 amount)
 */
export const handleDeposit = async (event, blockTimestamp) => {
    try {
        const { user, asset, amount } = event.args;
        const { transactionHash, blockNumber } = event.log;
        
        console.log(`Deposit Event: User ${user} deposited ${ethers.formatUnits(amount, 18)} of asset ${asset}`);
        
        // Create or get user
        await getOrCreateUser(user);
        
        // Get asset price in USD (18 decimals)
        let amountUSD = null;
        try {
            const assetPrice = await priceRouterContract.getPrice(asset);
            // Get asset decimals
            const erc20Contract = getERC20Contract(asset);
            const decimals = await erc20Contract.decimals();
            // Calculate USD: (amount * price) / 10^decimals
            // Both price and result are 18 decimals
            amountUSD = (amount * assetPrice / (10n ** BigInt(decimals))).toString();
        } catch (error) {
            console.warn(`Could not fetch price for asset ${asset}:`, error.message);
        }
        
        // Create transaction record
        await createTransaction({
            hash: transactionHash,
            userAddress: user,
            assetAddress: asset,
            type: 'deposit',
            amount: amount.toString(),
            amountUSD,
            blockNumber: blockNumber,
            timestamp: new Date(blockTimestamp * 1000)
        });
        
        // Get current balance from blockchain with retry
        const userBalance = await lendingPoolContract.userBalances(user, asset);
        const { deposited, borrowed } = userBalance;
        
        // Update or create user-asset association with actual balance
        const {userAsset, created } = await getOrCreateUserAsset({
            userAddress: user,
            assetAddress: asset,
            deposited: deposited.toString(),
            borrowed: borrowed.toString(),
        });

        if(!created){
            await updateUserAsset(user, asset, {deposited: deposited.toString(), borrowed: borrowed.toString()});
        }

        // Update asset total deposits
        const depositedAsset = await getAssetByAddress(asset);
        if (depositedAsset) {
            // Convert DECIMAL string to BigInt, add amount, convert back to string
            const currentDeposits = BigInt(depositedAsset.totalDeposits);
            const newTotalDeposits = currentDeposits + amount;
            await updateAssetBalances(
                asset,
                newTotalDeposits.toString(),
                depositedAsset.totalBorrows
            );
        }
        
        console.log(`Deposit processed: TX ${transactionHash}`);
    } catch (error) {
        console.error('Error handling Deposit event:', error);
        throw error;
    }
};

/**
 * Handle Withdraw event
 * Event signature: Withdraw(address indexed user, address indexed asset, uint256 amount)
 */
export const handleWithdraw = async (event, blockTimestamp) => {
    try {
        const { user, asset, amount } = event.args;
        const { transactionHash, blockNumber } = event.log;
        
        console.log(`Withdraw Event: User ${user} withdrew ${ethers.formatUnits(amount, 18)} of asset ${asset}`);
        
        // Get asset price in USD (18 decimals)
        let amountUSD = null;
        try {
            const assetPrice = await priceRouterContract.getPrice(asset);
            const erc20Contract = getERC20Contract(asset);
            const decimals = await erc20Contract.decimals();
            amountUSD = (amount * assetPrice / (10n ** BigInt(decimals))).toString();
        } catch (error) {
            console.warn(`Could not fetch price for asset ${asset}:`, error.message);
        }
        
        // Create transaction record
        await getOrCreateTransaction({
            hash: transactionHash,
            userAddress: user,
            assetAddress: asset,
            type: 'withdraw',
            amount: amount.toString(),
            amountUSD,
            blockNumber,
            timestamp: new Date(blockTimestamp * 1000)
        });
        
        // Update user-asset balance from blockchain
        const userAsset = await getUserAsset(user, asset);
        if (userAsset) {
            const userBalance = await lendingPoolContract.userBalances(user, asset);
            await updateUserAsset(user, asset, { 
                deposited: userBalance.deposited.toString(),
                borrowed: userBalance.borrowed.toString()
            });
        }
        
        // Update asset total deposits
        const withdrawnAsset = await getAssetByAddress(asset);
        if (withdrawnAsset) {
            const currentDeposits = BigInt(withdrawnAsset.totalDeposits);
            const newTotalDeposits = currentDeposits - amount;
            await updateAssetBalances(
                asset,
                newTotalDeposits.toString(),
                withdrawnAsset.totalBorrows
            );
        }
        
        console.log(`Withdraw processed: TX ${transactionHash}`);
    } catch (error) {
        console.error('Error handling Withdraw event:', error);
        throw error;
    }
};

/**
 * Handle Borrow event
 * Event signature: Borrow(address indexed user, address indexed asset, uint256 amount)
 */
export const handleBorrow = async (event, blockTimestamp) => {
    try {
        const { user, asset, amount } = event.args;
        const { transactionHash, blockNumber } = event.log;
        
        console.log(`Borrow Event: User ${user} borrowed ${ethers.formatUnits(amount, 18)} of asset ${asset}`);
        
        // Create or get user
        await getOrCreateUser(user);
        
        // Get asset price in USD (18 decimals)
        let amountUSD = null;
        try {
            const assetPrice = await priceRouterContract.getPrice(asset);
            const erc20Contract = getERC20Contract(asset);
            const decimals = await erc20Contract.decimals();
            amountUSD = (amount * assetPrice / (10n ** BigInt(decimals))).toString();
        } catch (error) {
            console.warn(`Could not fetch price for asset ${asset}:`, error.message);
        }
        
        // Create transaction record
        await getOrCreateTransaction({
            hash: transactionHash,
            userAddress: user,
            assetAddress: asset,
            type: 'borrow',
            amount: amount.toString(),
            amountUSD,
            blockNumber,
            timestamp: new Date(blockTimestamp * 1000)
        });
        
        // Get current balance from blockchain
        const userBalance = await lendingPoolContract.userBalances(user, asset);
        
        // Update or create user-asset association with actual balance
        const userAsset = await getUserAsset(user, asset);
        if (userAsset) {
            await updateUserAsset(user, asset, { 
                borrowed: userBalance.borrowed.toString(),
                deposited: userBalance.deposited.toString()
            });
        }
        
        // Update asset total borrows
        const borrowedAsset = await getAssetByAddress(asset);
        if (borrowedAsset) {
            const currentBorrows = BigInt(borrowedAsset.totalBorrows);
            const newTotalBorrows = currentBorrows + amount;
            await updateAssetBalances(
                asset,
                borrowedAsset.totalDeposits,
                newTotalBorrows.toString()
            );
        }
        
        console.log(`Borrow processed: TX ${transactionHash}`);
    } catch (error) {
        console.error('Error handling Borrow event:', error);
        throw error;
    }
};

/**
 * Handle Repay event
 * Event signature: Repay(address indexed user, address indexed asset, uint256 amount)
 */
export const handleRepay = async (event, blockTimestamp) => {
    try {
        const { user, asset, amount } = event.args;
        const { transactionHash, blockNumber } = event.log;
        
        console.log(`Repay Event: User ${user} repaid ${ethers.formatUnits(amount, 18)} of asset ${asset}`);
        
        // Get asset price in USD (18 decimals)
        let amountUSD = null;
        try {
            const assetPrice = await priceRouterContract.getPrice(asset);
            const erc20Contract = getERC20Contract(asset);
            const decimals = await erc20Contract.decimals();
            amountUSD = (amount * assetPrice / (10n ** BigInt(decimals))).toString();
        } catch (error) {
            console.warn(`Could not fetch price for asset ${asset}:`, error.message);
        }
        
        // Create transaction record
        await getOrCreateTransaction({
            hash: transactionHash,
            userAddress: user,
            assetAddress: asset,
            type: 'repay',
            amount: amount.toString(),
            amountUSD,
            blockNumber,
            timestamp: new Date(blockTimestamp * 1000)
        });
        
        // Update user-asset balance from blockchain
        const userAsset = await getUserAsset(user, asset);
        if (userAsset) {
            const userBalance = await lendingPoolContract.userBalances(user, asset);
            await updateUserAsset(user, asset, { 
                borrowed: userBalance.borrowed.toString(),
                deposited: userBalance.deposited.toString()
            });
        }
        
        // Update asset total borrows
        const repaidAsset = await getAssetByAddress(asset);
        if (repaidAsset) {
            const currentBorrows = BigInt(repaidAsset.totalBorrows);
            const newTotalBorrows = currentBorrows - amount;
            await updateAssetBalances(
                asset,
                repaidAsset.totalDeposits,
                newTotalBorrows.toString()
            );
        }
        
        console.log(`Repay processed: TX ${transactionHash}`);
    } catch (error) {
        console.error('Error handling Repay event:', error);
        throw error;
    }
};

/**
 * Handle CollateralSeized event (from liquidation)
 * Event signature: CollateralSeized(address indexed borrower, address indexed collateralAsset, uint256 seizeAmount)
 */
export const handleCollateralSeized = async (event, blockTimestamp) => {
    try {
        const { borrower, collateralAsset, seizeAmount } = event.args;
        const { transactionHash, blockNumber } = event.log;
        
        console.log(`Liquidation Event: ${ethers.formatUnits(seizeAmount, 18)} collateral seized from ${borrower}`);
        
        // Get asset price in USD (18 decimals)
        let amountUSD = null;
        try {
            const assetPrice = await priceRouterContract.getPrice(collateralAsset);
            const erc20Contract = getERC20Contract(collateralAsset);
            const decimals = await erc20Contract.decimals();
            amountUSD = (seizeAmount * assetPrice / (10n ** BigInt(decimals))).toString();
        } catch (error) {
            console.warn(`Could not fetch price for asset ${collateralAsset}:`, error.message);
        }
        
        // Create transaction record
        await getOrCreateTransaction({
            hash: transactionHash,
            userAddress: borrower,
            assetAddress: collateralAsset,
            type: 'liquidated',
            amount: seizeAmount.toString(),
            amountUSD,
            blockNumber: blockNumber,
            timestamp: new Date(blockTimestamp * 1000)
        });
        
        // Update user-asset deposited balance from blockchain
        const userAsset = await getUserAsset(borrower, collateralAsset);
        if (userAsset) {
            const userBalance = await lendingPoolContract.userBalances(borrower, collateralAsset);
            await updateUserAsset(borrower, collateralAsset, { 
                deposited: userBalance.deposited.toString() 
            });
        }
        
        console.log(`Liquidation processed: TX ${transactionHash}`);
    } catch (error) {
        console.error('Error handling CollateralSeized event:', error);
        throw error;
    }
};

/**
 * Handle Accrue event (interest accrual)
 * Event signature: Accrue(address indexed asset, uint256 interestAccrued, uint256 depositInterestAccrued, 
 *                         uint256 newTotalBorrows, uint256 newBorrowIndex, uint256 newTotalDeposits, uint256 newDepositIndex)
 */
export const handleAccrue = async (event, blockTimestamp) => {
    try {
        const { 
            asset,
            newTotalBorrows,
            newTotalDeposits
        } = event.args;
        
        console.log(`Accrue Event: Asset ${asset} - Deposits: ${ethers.formatUnits(newTotalDeposits, 18)}, Borrows: ${ethers.formatUnits(newTotalBorrows, 18)}`);
        
        // Update asset balances in database
        await updateAssetBalances(
            asset,
            newTotalDeposits.toString(),
            newTotalBorrows.toString()
        );
        
        console.log(`Asset ${asset} balances updated`);
    } catch (error) {
        console.error('Error handling Accrue event:', error);
        throw error;
    }
};

/**
 * Handle MarketSupported event
 * Event signature: MarketSupported(address indexed asset, address interestRateModel)
 */
export const handleMarketSupported = async (event, blockTimestamp) => {
    try {
        const { asset, interestRateModel } = event.args;

        const erc20Contract = getERC20Contract(asset);
        const name = await erc20Contract.name();
        const symbol = await erc20Contract.symbol();
        const decimals = await erc20Contract.decimals();

        const { asset: assetRecord, created } = await getOrCreateAsset({
            address: asset,
            name,
            symbol,
            decimals
        });

        if (!created) {
            await updateAssetSupportStatus(asset, true);
        }

        // Create default market config if not exists
        const marketConfig = await getMarketConfigByAddress(asset);
        if (!marketConfig) {
            await createMarketConfig(asset);
        }

        console.log(`MarketSupported Event: Asset ${asset} with interest model ${interestRateModel}`);
    } catch (error) {
        console.error('Error handling MarketSupported event:', error);
        throw error;
    }
};

/**
 * Handle MarketUnsupported event
 * Event signature: MarketUnsupported(address indexed asset)
 */
export const handleMarketUnsupported = async (event, blockTimestamp) => {
    try {
        const { asset } = event.args;
        
        console.log(`🚫 MarketUnsupported Event: Asset ${asset}`);
        
        const assetExist = await getAssetByAddress(asset);
        if (assetExist) await updateAssetSupportStatus(asset, false);
        
        console.log(`Market unsupported noted for ${asset}`);
    } catch (error) {
        console.error('Error handling MarketUnsupported event:', error);
        throw error;
    }
};

export const handleCollateralFactorUpdated = async (event, blockTimestamp) => {
    try {
        const {
            newCollateralFactor
        } = event.args;
        
        await updateMarketConfig({
            collateralFactor: newCollateralFactor.toString()
        });
        
        console.log("Collateral Factor updated");
    } catch (error) {
        console.error('Error handling CollateralFactorUpdated event:', error);
        throw error;
    }
};

export const handleLiquidationParamsUpdated = async (event, blockTimestamp) => {
    try {
        const {
            closeFactor,
            liquidationIncentive,
            liquidationThreshold
        } = event.args;
        
        
        await updateMarketConfig({
            closeFactor: closeFactor.toString(),
            liquidationIncentive: liquidationIncentive.toString(),
            liquidationThreshold: liquidationThreshold.toString()
        });
        console.log("Liquidation params updated");
    } catch (error) {
        console.error('Error handling MarketConfigUpdated event:', error);
        throw error;
    }
};

export const calculateLiquidatableUsers = async () => {
    try {
        console.log('Calculating liquidatable users...');
        
        const allUsers = await getAllAssetsUsers();
        const activeUsers = allUsers.filter(ua => BigInt(ua.borrowed) > 0n);
        const activeAddresses = [...new Set(activeUsers.map(ua => ua.userAddress))];
        
        // Get current liquidatable users from database
        const existingLiquidatable = await getAllLiquidatableUsers();
        const existingAddresses = new Set(existingLiquidatable.map(u => u.userAddress));
        
        const currentLiquidatableAddresses = [];
        
        // Check each active user
        for (const userAddress of activeAddresses) {
            try {
                const isLiquidatable = await liquidationContract.isAccountLiquidatable(userAddress);
                
                if (isLiquidatable) {
                    currentLiquidatableAddresses.push(userAddress);
                    
                    // Only add if not already in database
                    if (!existingAddresses.has(userAddress)) {
                        await createLiquidatableUser(userAddress);
                        console.log(`✅ User ${userAddress} is now liquidatable (added)`);
                    }
                } else {
                    // User is no longer liquidatable, remove if exists
                    if (existingAddresses.has(userAddress)) {
                        await removeLiquidatableUser(userAddress);
                        console.log(`❌ User ${userAddress} is no longer liquidatable (removed)`);
                    }
                }
            } catch (error) {
                console.error(`Error checking liquidatability for user ${userAddress}:`, error);
            }
        }
        
        // Remove users that are no longer active (fully repaid/withdrawn)
        const currentActiveSet = new Set(activeAddresses);
        for (const existingUser of existingLiquidatable) {
            if (!currentActiveSet.has(existingUser.userAddress)) {
                await removeLiquidatableUser(existingUser.userAddress);
                console.log(`🔄 User ${existingUser.userAddress} no longer has borrows (removed)`);
            }
        }
        
        console.log(`Liquidatable users calculation completed: ${currentLiquidatableAddresses.length} users`);
        return currentLiquidatableAddresses;
    } catch (error) {
        console.error('Error calculating liquidatable users:', error);
        throw error;
    }
};
