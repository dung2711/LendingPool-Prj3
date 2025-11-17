// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IPriceRouter, IInterestRateModel, ILiquidation} from "./interfaces/Interfaces.sol";

contract LendingPool is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint public constant SECONDS_PER_YEAR = 60 * 60 * 24 * 365;
    uint public constant SCALE = 1e18;

    event AdminAdded(address indexed admin);
    event AdminRemoved(address indexed admin);
    event MarketSupported(address indexed asset, address interestRateModel);
    event MarketUnsupported(address indexed asset);
    event CollateralFactorUpdated(uint newCollateralFactor);
    event Deposit(address indexed user, address indexed asset, uint amount);
    event Borrow(address indexed user, address indexed asset, uint amount);
    event Repay(address indexed user, address indexed asset, uint amount);
    event Withdraw(address indexed user, address indexed asset, uint amount);
    event CollateralSeized(address indexed borrower, address indexed collateralAsset, uint seizeAmount);
    event RepayFromLiquidation(address indexed borrower, address indexed repayAsset, uint repayAmount);
    event Accrue(address indexed asset, uint interestAccrued, uint depositInterestAccrued, 
                                uint newTotalBorrows, uint newBorrowIndex, uint newTotalDeposits, uint newDepositIndex);

    struct Market {
        bool isSupported;
        uint totalDeposits;
        uint totalBorrows;
        uint borrowIndex;
        uint depositIndex;
        uint lastUpdateTimestamp;
        address interestRateModel;
    }

    struct Balance {
        uint deposited;
        uint borrowed;
        uint borrowIndexSnapShot;
        uint depositIndexSnapShot;
    }

    mapping(address => Market) public markets; // asset => Market
    address[] public allMarkets; // list of all supported assets
    mapping(address => bool) public marketExists; // asset => exists
    mapping(address => mapping(address => Balance)) public userBalances; // user => asset => Balance
    mapping(address => address[]) public userMarkets; // user => list of assets
    mapping(address => mapping(address => bool)) public userMarketExists; // user => asset => exists

    uint public collateralFactor; // 18 decimals

    address public liquidation;
    address public priceRouter;

    mapping(address => bool) public isAdmin;

    constructor(
        address _liquidation,
        address _priceRouter,
        uint _collateralFactor
    ) Ownable(msg.sender) {
        liquidation = _liquidation;
        priceRouter = _priceRouter;
        collateralFactor = _collateralFactor;
        isAdmin[msg.sender] = true;
    }

    modifier onlyAdmin() {
        require(isAdmin[msg.sender], "Not an admin");
        _;
    }

    modifier onlyLiquidation() {
        require(msg.sender == liquidation, "Not liquidation contract");
        _;
    }

    modifier onlySupportedMarket(address asset) {
        require(markets[asset].isSupported, "Market not supported");
        _;
    }

    modifier amountGreaterThanZero(uint amount) {
        require(amount > 0, "Amount must be greater than zero");
        _;
    }

    /// Config functions
    function setAdmin(address admin, bool allowed) external onlyOwner {
        isAdmin[admin] = allowed;
        if(allowed){
            emit AdminAdded(admin);
        } else {
            emit AdminRemoved(admin);
        }
    }

    function supportMarket(address asset, address interestRateModel) external onlyAdmin {
        if(marketExists[asset]){
            markets[asset].isSupported = true;
            markets[asset].interestRateModel = interestRateModel;
            emit MarketSupported(asset, interestRateModel);
            return;
        } else {
            markets[asset] = Market({
            isSupported: true,
            totalDeposits: 0,
            totalBorrows: 0,
            borrowIndex: SCALE,
            depositIndex: SCALE,
            lastUpdateTimestamp: block.timestamp,
            interestRateModel: interestRateModel
            });
            allMarkets.push(asset);
            marketExists[asset] = true;
            emit MarketSupported(asset, interestRateModel);
        }
    }

    function unsupportMarket(address asset) external onlyAdmin {
        markets[asset].isSupported = false;
        emit MarketUnsupported(asset);
    }

    function setPriceRouter(address _priceRouter) external onlyAdmin {
        priceRouter = _priceRouter;
    }

    function setLiquidation(address _liquidation) external onlyAdmin {
        liquidation = _liquidation;
    }

    function setCollateralParams(uint _collateralFactor) external onlyAdmin {
        collateralFactor = _collateralFactor;
        emit CollateralFactorUpdated(_collateralFactor);
    }

    /// Interest functions
    function getUtilizationRate(address asset) public view returns (uint) {
        Market memory market = markets[asset];
        if(market.totalDeposits == 0) return 0;
        return market.totalBorrows * SCALE / market.totalDeposits; // 18 decimals
    }

    function accrueInterest(address asset) public {
        Market storage m = markets[asset];
        if(!m.isSupported) return;

        uint timeElapsed = block.timestamp - m.lastUpdateTimestamp;
        if(timeElapsed == 0) return;

        IInterestRateModel i = IInterestRateModel(m.interestRateModel);
        uint borrowRate = i.getBorrowRate(asset);
        uint depositRate = i.getDepositRate(asset);

        uint interestAccrued = (m.totalBorrows * borrowRate * timeElapsed) / SECONDS_PER_YEAR / SCALE;
        m.totalBorrows += interestAccrued;
        uint borrowIndexIncrease = (m.borrowIndex * borrowRate * timeElapsed) / SECONDS_PER_YEAR / SCALE;
        m.borrowIndex += borrowIndexIncrease;

        uint depositInterestAccrued = (m.totalDeposits * depositRate * timeElapsed) / SECONDS_PER_YEAR / SCALE;
        m.totalDeposits += depositInterestAccrued;
        uint depositIndexIncrease = (m.depositIndex * depositRate * timeElapsed) / SECONDS_PER_YEAR / SCALE;
        m.depositIndex += depositIndexIncrease;
        
        m.lastUpdateTimestamp = block.timestamp;
        emit Accrue(asset, interestAccrued, depositInterestAccrued, m.totalBorrows, m.borrowIndex, m.totalDeposits, m.depositIndex);
    }

    /// Utility - compute user's current balances
    function _currentUserDeposit(address user, address asset) internal view returns (uint) {
        Balance memory b = userBalances[user][asset];
        Market memory m = markets[asset];
        if(b.deposited == 0) return 0;
        if(b.depositIndexSnapShot == 0) return b.deposited;
        return b.deposited * m.depositIndex / b.depositIndexSnapShot;
    }

    function _currentUserBorrow(address user, address asset) internal view returns (uint) {
        Balance memory b = userBalances[user][asset];
        Market memory m = markets[asset];
        if(b.borrowed == 0) return 0;
        if(b.borrowIndexSnapShot == 0) return b.borrowed;
        return b.borrowed * m.borrowIndex / b.borrowIndexSnapShot;
    }

    function getAccountLiquidity(address user) public view returns (uint totalDepositedUSD, uint totalBorrowedUSD) {
        IPriceRouter pr = IPriceRouter(priceRouter);
        address[] memory assets = userMarkets[user];
        for(uint i=0; i<assets.length; i++){
            address asset = assets[i];
            uint currentDeposit = _currentUserDeposit(user, asset);
            uint currentBorrow = _currentUserBorrow(user, asset);
            uint assetPrice = pr.getPrice(asset);
            uint decimals = IERC20Metadata(asset).decimals();
            // Normalize to 18 decimals: (18 decimals price * token decimals) * 10^(18 - token decimals) / 10^18
            totalDepositedUSD += assetPrice * currentDeposit / (10 ** decimals);
            totalBorrowedUSD += assetPrice * currentBorrow / (10 ** decimals);
        }
        return (totalDepositedUSD, totalBorrowedUSD);
    }

    /// View helpers
    function getUserCurrentDeposit(address user, address asset) external view returns (uint) {
        return _currentUserDeposit(user, asset);
    }

    function getUserCurrentBorrow(address user, address asset) external view returns (uint) {
        return _currentUserBorrow(user, asset);
    }

    /// Core Logic: deposit, borrow, repay, withdraw
    function deposit(address asset, uint amount) external nonReentrant onlySupportedMarket(asset) amountGreaterThanZero(amount) {
        accrueInterest(asset);
        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
        Market storage m = markets[asset];
        Balance storage b = userBalances[msg.sender][asset];
        // Update userBalances and totalDeposits
        uint currentBalance = _currentUserDeposit(msg.sender, asset);
        b.deposited = amount + currentBalance;
        b.depositIndexSnapShot = m.depositIndex;
        m.totalDeposits += amount;  
        if(!userMarketExists[msg.sender][asset]){
            userMarkets[msg.sender].push(asset);
            userMarketExists[msg.sender][asset] = true;
        }
        emit Deposit(msg.sender, asset, amount);
    }

    function borrow(address asset, uint amount) external nonReentrant onlySupportedMarket(asset) amountGreaterThanZero(amount) {
        accrueInterest(asset);
        Market storage m = markets[asset];
        Balance storage b = userBalances[msg.sender][asset];
        // Calculate total collateral and ensure user can borrow
        (uint totalDepositedUSD, uint totalBorrowedUSD) = getAccountLiquidity(msg.sender);
        uint assetPrice = IPriceRouter(priceRouter).getPrice(asset);
        uint decimals = IERC20Metadata(asset).decimals();
        uint amountUSD = assetPrice * amount * (10 ** (18 - decimals)) / SCALE;
        require(totalDepositedUSD * collateralFactor / SCALE >= (totalBorrowedUSD + amountUSD), "Insufficient collateral");
        // Update userBalances and totalBorrows
        uint currentBorrow = _currentUserBorrow(msg.sender, asset);
        b.borrowed = amount + currentBorrow;
        b.borrowIndexSnapShot = m.borrowIndex;
        m.totalBorrows += amount;
        IERC20(asset).safeTransfer(msg.sender, amount);
        emit Borrow(msg.sender, asset, amount);
    }

    function repay(address asset, uint amount) external nonReentrant onlySupportedMarket(asset) amountGreaterThanZero(amount) {
        // Repay logic
        accrueInterest(asset);
        Market storage m = markets[asset];
        Balance storage b = userBalances[msg.sender][asset];
        // Update userBalances and totalBorrows
        uint currentBorrow = _currentUserBorrow(msg.sender, asset);
        require(currentBorrow >= amount, "Repay amount exceeds borrowed");

        uint payAmount = amount;
        if(payAmount > currentBorrow){
            payAmount = currentBorrow;
        }
        IERC20(asset).safeTransferFrom(msg.sender, address(this), payAmount);
        uint newBorrow = currentBorrow - payAmount;
        if (newBorrow == 0) {
            b.borrowed = 0;
            b.borrowIndexSnapShot = 0;
        } else {
            b.borrowed = newBorrow;
            b.borrowIndexSnapShot = m.borrowIndex;
        }
        m.totalBorrows -= payAmount;
        emit Repay(msg.sender, asset, payAmount);
    }

    function withdraw(address asset, uint amount) 
        external 
        nonReentrant 
        onlySupportedMarket(asset) 
        amountGreaterThanZero(amount) 
    {
        accrueInterest(asset);
        Market storage m = markets[asset];
        Balance storage b = userBalances[msg.sender][asset];
        // Check user's deposit balance 
        uint currentDeposit = _currentUserDeposit(msg.sender, asset);
        require(currentDeposit >= amount, "Withdraw amount exceeds deposited");
        // Check if user has sufficient collateral after withdrawal
        (uint totalDepositedUSD, uint totalBorrowedUSD) = this.getAccountLiquidity(msg.sender);
        uint assetPrice = IPriceRouter(priceRouter).getPrice(asset);
        uint decimals = IERC20Metadata(asset).decimals();
        uint amountUSD = assetPrice * amount * (10 ** (18 - decimals)) / SCALE;
        require((totalDepositedUSD - amountUSD) * collateralFactor / SCALE > totalBorrowedUSD, "Insufficient collateral");
        // Update userBalances and totalDeposits
        uint newDeposit = currentDeposit - amount;
        if (newDeposit == 0) {
            b.deposited = 0;
            b.depositIndexSnapShot = 0;
        } else {
            b.deposited = newDeposit;
            b.depositIndexSnapShot = m.depositIndex;
        }
        m.totalDeposits -= amount;
        IERC20(asset).safeTransfer(msg.sender, amount);
        emit Withdraw(msg.sender, asset, amount);
    }

    /// Liquidation hooks (only callable by Liquidation contract)
    function seizeCollateral(
        address borrower,
        address collateralAsset,
        uint seizeAmount,
        address recipient
    ) external onlyLiquidation amountGreaterThanZero(seizeAmount) {
        accrueInterest(collateralAsset);
        Balance storage borrowerBalance = userBalances[borrower][collateralAsset];
        Market storage m = markets[collateralAsset];
        uint currentBorrowerDeposit = _currentUserDeposit(borrower, collateralAsset);
        require(currentBorrowerDeposit >= seizeAmount, "Not enough collateral");
        // Update borrower balances
        uint newDeposit = currentBorrowerDeposit - seizeAmount;
        if (newDeposit == 0) {
            borrowerBalance.deposited = 0;
            borrowerBalance.depositIndexSnapShot = 0;
        } else {
            borrowerBalance.deposited = newDeposit;
            borrowerBalance.depositIndexSnapShot = m.depositIndex;
        }
        m.totalDeposits -= seizeAmount;

        IERC20(collateralAsset).safeTransfer(recipient, seizeAmount);
        emit CollateralSeized(borrower, collateralAsset, seizeAmount);
    }
    
    function repayFromLiquidation(
        address borrower,
        address repayAsset,
        uint repayAmount
    ) external onlyLiquidation amountGreaterThanZero(repayAmount) {
        accrueInterest(repayAsset);
        Market storage m = markets[repayAsset];
        Balance storage b = userBalances[borrower][repayAsset];
        // Update borrower balances
        uint currentBorrow = _currentUserBorrow(borrower, repayAsset);

        // repayAmount should not exceed currentBorrow: checked in Liquidation contract
        uint newBorrow = currentBorrow - repayAmount;
        if (newBorrow == 0) {
            b.borrowed = 0;
            b.borrowIndexSnapShot = 0;
        } else {
            b.borrowed = newBorrow;
            b.borrowIndexSnapShot = m.borrowIndex;
        }
        b.borrowIndexSnapShot = m.borrowIndex;
        m.totalBorrows -= repayAmount;

        emit RepayFromLiquidation(borrower, repayAsset, repayAmount);
    }

    /// Helpers for frontend
    function getAllMarkets() external view returns (address[] memory) {
        return allMarkets;
    }

    /**
     * @notice Returns market information for a given asset.
     * @param asset The address of the asset to query.
     * @return totalDeposits The total amount deposited in the market.
     * @return totalBorrows The total amount borrowed from the market.
     * @return depositRate The current deposit interest rate for the asset.
     * @return borrowRate The current borrow interest rate for the asset.
     * @return utilizationRate The current utilization rate of the market.
     */
    function getMarketInfo(address asset) external view returns (
        uint totalDeposits,
        uint totalBorrows,
        uint depositRate,
        uint borrowRate,
        uint utilizationRate
    ) {
        Market memory m = markets[asset];
        require(m.isSupported, "Market not supported");
        totalDeposits = m.totalDeposits;
        totalBorrows = m.totalBorrows;
        utilizationRate = getUtilizationRate(asset);
        borrowRate = IInterestRateModel(m.interestRateModel).getBorrowRate(asset);
        depositRate = IInterestRateModel(m.interestRateModel).getDepositRate(asset);
    }

    function getUserInfo(address user) external view returns (
        address[] memory assets,
        uint[] memory deposited,
        uint[] memory borrowed,
        uint totalDeposited,
        uint totalBorrowedUSD,
        uint healthFactor // 18 decimals
    ) {
        assets = userMarkets[user];
        uint len = assets.length;
        deposited = new uint[](len);
        borrowed = new uint[](len);
        for(uint i=0; i<len; i++){
            address asset = assets[i];
            deposited[i] = _currentUserDeposit(user, asset);
            borrowed[i] = _currentUserBorrow(user, asset);
        }
        (totalDeposited, totalBorrowedUSD) = getAccountLiquidity(user);
        if(totalBorrowedUSD == 0){
            healthFactor = type(uint).max;
        } else {
            uint liquidationThreshold = ILiquidation(liquidation).liquidationThreshold();
            healthFactor = (totalDeposited * liquidationThreshold) / totalBorrowedUSD;
        }
    }

    function preViewBorrow(address user, address asset, uint amount) 
        external 
        view 
        returns (
            uint totalDepositedUSD, 
            uint totalBorrowedUSD, 
            uint newBorrowUSD, 
            uint newHealthFactor
        ) 
    {   
        require(markets[asset].isSupported, "Market not supported");
        require(amount > 0, "Amount must be greater than zero");
        (totalDepositedUSD, totalBorrowedUSD) = getAccountLiquidity(user);
        uint assetPrice = IPriceRouter(priceRouter).getPrice(asset);
        uint decimals = IERC20Metadata(asset).decimals();
        uint amountUSD = assetPrice * amount * (10 ** (18 - decimals)) / SCALE;
        newBorrowUSD = totalBorrowedUSD + amountUSD;
        if(newBorrowUSD == 0){
            newHealthFactor = type(uint).max;
        } else {
            uint liquidationThreshold = ILiquidation(liquidation).liquidationThreshold();
            newHealthFactor = (totalDepositedUSD * liquidationThreshold) / newBorrowUSD;
        }
    }

    function preViewWithdraw(address user, address asset, uint amount) 
        external 
        view 
        returns (
            uint totalDepositedUSD, 
            uint totalBorrowedUSD, 
            uint newDepositedUSD, 
            uint newHealthFactor
        ) 
    {   
        require(markets[asset].isSupported, "Market not supported");
        require(amount > 0, "Amount must be greater than zero");
        (totalDepositedUSD, totalBorrowedUSD) = getAccountLiquidity(user);
        uint assetPrice = IPriceRouter(priceRouter).getPrice(asset);
        uint decimals = IERC20Metadata(asset).decimals();
        uint amountUSD = assetPrice * amount * (10 ** (18 - decimals)) / SCALE;
        newDepositedUSD = totalDepositedUSD > amountUSD ? totalDepositedUSD - amountUSD : 0;
        if(totalBorrowedUSD == 0){
            newHealthFactor = type(uint).max;
        } else {
            uint liquidationThreshold = ILiquidation(liquidation).liquidationThreshold();
            newHealthFactor = (newDepositedUSD * liquidationThreshold) / totalBorrowedUSD;
        }
    }

    function preViewRepay(address user, address asset, uint amount) 
        external 
        view 
        returns (
            uint totalBorrowedUSD, 
            uint newBorrowedUSD
        ) 
    {   
        require(markets[asset].isSupported, "Market not supported");
        require(amount > 0, "Amount must be greater than zero");
        ( , totalBorrowedUSD) = getAccountLiquidity(user);
        uint assetPrice = IPriceRouter(priceRouter).getPrice(asset);
        uint decimals = IERC20Metadata(asset).decimals();
        uint amountUSD = assetPrice * amount * (10 ** (18 - decimals)) / SCALE;
        newBorrowedUSD = totalBorrowedUSD > amountUSD ? totalBorrowedUSD - amountUSD : 0;
    }

    function preViewDeposit(address user, address asset, uint amount) 
        external 
        view 
        returns (
            uint totalDepositedUSD, 
            uint newDepositedUSD
        ) 
    {   
        require(markets[asset].isSupported, "Market not supported");
        require(amount > 0, "Amount must be greater than zero");
        (totalDepositedUSD, ) = getAccountLiquidity(user);
        uint assetPrice = IPriceRouter(priceRouter).getPrice(asset);
        uint decimals = IERC20Metadata(asset).decimals();
        uint amountUSD = assetPrice * amount * (10 ** (18 - decimals)) / SCALE;
        newDepositedUSD = totalDepositedUSD + amountUSD;
    }
}