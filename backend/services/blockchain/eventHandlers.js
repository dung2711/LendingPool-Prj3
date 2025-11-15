import { ethers } from 'ethers';
import { 
    getOrCreateUser,
} from '../../controllers/userController.js';
import { getOrCreateTransaction, createTransaction } from '../../controllers/transactionController.js';
import { 
    getOrCreateUserAsset,
    updateUserAsset,
    getUserAsset,
} from '../../controllers/userAssetController.js';
import { 
    updateAssetBalances, 
    getOrCreateAsset, 
    getAssetByAddress,
    updateAssetSupportStatus 
} from '../../controllers/assetController.js';
import { getLendingPoolContract, getERC20Contract } from './contract.js';


const lendingPoolContract = getLendingPoolContract();

/**
 * Handle Deposit event
 * Event signature: Deposit(address indexed user, address indexed asset, uint256 amount)
 */
export const handleDeposit = async (event, blockTimestamp) => {
    try {
        const { user, asset, amount } = event.args;
        const { transactionHash, blockNumber } = event.log;
        
        console.log(transactionHash, blockNumber, blockTimestamp);
        console.log(`Deposit Event: User ${user} deposited ${ethers.formatUnits(amount, 18)} of asset ${asset}`);
        
        // Create or get user
        await getOrCreateUser(user);
        
        // Create transaction record
        await createTransaction({
            hash: transactionHash,
            userAddress: user,
            assetAddress: asset,
            type: 'deposit',
            amount: amount.toString(),
            blockNumber: blockNumber,
            timestamp: new Date(blockTimestamp * 1000)
        });
        
        // Get current balance from blockchain with retry
        const userBalance = await lendingPoolContract.userBalances(user, asset);
        
        // Update or create user-asset association with actual balance
        await getOrCreateUserAsset({
            userAddress: user,
            assetAddress: asset,
            deposited: userBalance.deposited.toString(),
            borrowed: userBalance.borrowed.toString(),
        });
        
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
        
        // Create transaction record
        await getOrCreateTransaction({
            hash: transactionHash,
            userAddress: user,
            assetAddress: asset,
            type: 'withdraw',
            amount: amount.toString(),
            blockNumber,
            timestamp: new Date(blockTimestamp * 1000)
        });
        
        // Update user-asset balance from blockchain
        const userAsset = await getUserAsset(user, asset);
        if (userAsset) {
            const userBalance = await lendingPoolContract.userBalances(user, asset);
            await updateUserAsset(user, asset, { 
                deposited: userBalance.deposited.toString() 
            });
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
        
        // Create transaction record
        await getOrCreateTransaction({
            hash: transactionHash,
            userAddress: user,
            assetAddress: asset,
            type: 'borrow',
            amount: amount.toString(),
            blockNumber,
            timestamp: new Date(blockTimestamp * 1000)
        });
        
        // Get current balance from blockchain
        const userBalance = await lendingPoolContract.userBalances(user, asset);
        
        // Update or create user-asset association with actual balance
        await getOrCreateUserAsset({
            userAddress: user,
            assetAddress: asset,
            deposited: userBalance.deposited.toString(),
            borrowed: userBalance.borrowed.toString()
        });
        
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
        
        // Create transaction record
        await getOrCreateTransaction({
            hash: transactionHash,
            userAddress: user,
            assetAddress: asset,
            type: 'repay',
            amount: amount.toString(),
            blockNumber,
            timestamp: new Date(blockTimestamp * 1000)
        });
        
        // Update user-asset balance from blockchain
        const userAsset = await getUserAsset(user, asset);
        if (userAsset) {
            const userBalance = await lendingPoolContract.userBalances(user, asset);
            await updateUserAsset(user, asset, { 
                borrowed: userBalance.borrowed.toString() 
            });
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
        
        // Create transaction record
        await getOrCreateTransaction({
            hash: transactionHash,
            userAddress: borrower,
            assetAddress: collateralAsset,
            type: 'liquidated',
            amount: seizeAmount.toString(),
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
