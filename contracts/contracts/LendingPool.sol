// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {
    IERC20Metadata
} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {
    SafeERC20
} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {
    ReentrancyGuardTransient
} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {
    PausableUpgradeable
} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {
    Initializable
} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {
    UUPSUpgradeable
} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {
    IPriceRouter,
    IInterestRateModel,
    ILiquidation
} from "./interfaces/Interfaces.sol";
import {LendingPoolStorage} from "./LendingPoolStorage.sol";

contract LendingPool is
    Initializable,
    PausableUpgradeable,
    ReentrancyGuardTransient,
    UUPSUpgradeable,
    LendingPoolStorage
{
    using SafeERC20 for IERC20;

    // ─── Events ───────────────────────────────────────────────────────────────

    event MarketSupported(address indexed asset, address interestRateModel);
    event MarketUnsupported(address indexed asset);
    event CollateralFactorUpdated(uint newCollateralFactor);
    event Deposit(address indexed user, address indexed asset, uint amount);
    event Borrow(address indexed user, address indexed asset, uint amount);
    event Repay(address indexed user, address indexed asset, uint amount);
    event Withdraw(address indexed user, address indexed asset, uint amount);
    event CollateralSeized(
        address indexed borrower,
        address indexed collateralAsset,
        uint seizeAmount
    );
    event RepayFromLiquidation(
        address indexed borrower,
        address indexed repayAsset,
        uint repayAmount
    );
    event Accrue(
        address indexed asset,
        uint interestAccrued,
        uint toDepositors,
        uint toTreasury,
        uint totalTreasury,
        uint newTotalBorrows,
        uint newBorrowIndex,
        uint newTotalDeposits,
        uint newDepositIndex
    );
    event Donated(address indexed donor, address indexed asset, uint amount);
    event TreasuryWithdrawn(
        address indexed asset,
        address indexed to,
        uint amount
    );
    event TokenRescued(address indexed token, address indexed to, uint amount);

    // ─── Constructor & Initializer ────────────────────────────────────────────

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _liquidation,
        address _priceRouter,
        uint _collateralFactor,
        address _controller
    ) public initializer {
        __Pausable_init();

        require(_controller != address(0), "Invalid controller address");
        require(_liquidation != address(0), "Invalid liquidation");
        require(_priceRouter != address(0), "Invalid price router");
        require(
            _collateralFactor > 0 && _collateralFactor <= SCALE,
            "Invalid collateral factor"
        );
        controller = _controller;
        liquidation = _liquidation;
        priceRouter = _priceRouter;
        collateralFactor = _collateralFactor;
    }

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyController() {
        require(msg.sender == controller, "Only controller can call");
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

    // ─── Admin (onlyController) ───────────────────────────────────────────────

    function setController(address _controller) external onlyController {
        require(_controller != address(0), "Invalid controller address");
        controller = _controller;
    }

    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyController {}

    function pause() external onlyController {
        _pause();
    }

    function unpause() external onlyController {
        _unpause();
    }

    function supportMarket(
        address asset,
        address interestRateModel
    ) external onlyController {
        if (marketExists[asset]) {
            markets[asset].isSupported = true;
            markets[asset].interestRateModel = interestRateModel;
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
        }
        emit MarketSupported(asset, interestRateModel);
    }

    function unsupportMarket(address asset) external onlyController {
        markets[asset].isSupported = false;
        emit MarketUnsupported(asset);
    }

    function setInterestRateModel(
        address asset,
        address interestRateModel
    ) external onlyController {
        Market storage m = markets[asset];
        require(m.isSupported, "Market not supported");
        m.interestRateModel = interestRateModel;
        emit MarketSupported(asset, interestRateModel);
    }

    function setPriceRouter(address _priceRouter) external onlyController {
        priceRouter = _priceRouter;
    }

    function setLiquidation(address _liquidation) external onlyController {
        liquidation = _liquidation;
    }

    function setCollateralParams(
        uint _collateralFactor
    ) external onlyController {
        require(
            _collateralFactor > 0 && _collateralFactor <= SCALE,
            "Invalid collateral factor"
        );
        collateralFactor = _collateralFactor;
        emit CollateralFactorUpdated(_collateralFactor);
    }

    function donate(
        address asset,
        uint amount
    )
        external
        nonReentrant
        amountGreaterThanZero(amount)
        whenNotPaused
        onlySupportedMarket(asset)
    {
        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
        treasuryBalances[asset] += amount;
        emit Donated(msg.sender, asset, amount);
    }

    function withdrawTreasury(
        address asset,
        address to,
        uint amount
    ) external onlyController amountGreaterThanZero(amount) {
        require(to != address(0), "Invalid recipient");
        require(amount <= treasuryBalances[asset], "Exceeds treasury balance");
        Market storage m = markets[asset];
        require(
            m.totalDeposits + treasuryBalances[asset] - amount >=
                m.totalBorrows,
            "Insufficient liquidity after withdrawal"
        );
        treasuryBalances[asset] -= amount;
        IERC20(asset).safeTransfer(to, amount);
        emit TreasuryWithdrawn(asset, to, amount);
    }

    function rescueToken(
        address token,
        address to,
        uint amount
    ) external onlyController amountGreaterThanZero(amount) {
        require(to != address(0), "Invalid recipient");
        uint actual = IERC20(token).balanceOf(address(this));
        uint tracked = markets[token].totalDeposits + treasuryBalances[token];
        uint surplus = actual > tracked ? actual - tracked : 0;
        require(amount <= surplus, "Amount exceeds surplus");
        IERC20(token).safeTransfer(to, amount);
        emit TokenRescued(token, to, amount);
    }

    // ─── Core Logic ───────────────────────────────────────────────────────────

    function accrueInterest(address asset) public whenNotPaused {
        Market storage m = markets[asset];
        if (!m.isSupported) return;

        uint timeElapsed = block.timestamp - m.lastUpdateTimestamp;
        if (timeElapsed == 0) return;

        uint utilizationRate = getUtilizationRate(asset);
        IInterestRateModel i = IInterestRateModel(m.interestRateModel);
        uint borrowRate = i.getBorrowRate(utilizationRate);
        uint depositRate = i.getDepositRate(utilizationRate);

        uint interestAccrued = (m.totalBorrows * borrowRate * timeElapsed) /
            SECONDS_PER_YEAR /
            SCALE;
        m.totalBorrows += interestAccrued;
        uint borrowIndexIncrease = (m.borrowIndex * borrowRate * timeElapsed) /
            SECONDS_PER_YEAR /
            SCALE;
        m.borrowIndex += borrowIndexIncrease;

        uint depositInterestAccrued = (m.totalDeposits *
            depositRate *
            timeElapsed) /
            SECONDS_PER_YEAR /
            SCALE;
        m.totalDeposits += depositInterestAccrued;
        uint depositIndexIncrease = (m.depositIndex *
            depositRate *
            timeElapsed) /
            SECONDS_PER_YEAR /
            SCALE;
        m.depositIndex += depositIndexIncrease;

        uint toTreasury = interestAccrued > depositInterestAccrued
            ? interestAccrued - depositInterestAccrued
            : 0;
        treasuryBalances[asset] += toTreasury;

        m.lastUpdateTimestamp = block.timestamp;
        emit Accrue(
            asset,
            interestAccrued,
            depositInterestAccrued,
            toTreasury,
            treasuryBalances[asset],
            m.totalBorrows,
            m.borrowIndex,
            m.totalDeposits,
            m.depositIndex
        );
    }

    function deposit(
        address asset,
        uint amount
    )
        external
        nonReentrant
        whenNotPaused
        onlySupportedMarket(asset)
        amountGreaterThanZero(amount)
    {
        accrueInterest(asset);
        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
        Market storage m = markets[asset];
        Balance storage b = userBalances[msg.sender][asset];
        // Update userBalances and totalDeposits
        uint currentBalance = _currentUserDeposit(msg.sender, asset);
        b.deposited = amount + currentBalance;
        b.depositIndexSnapShot = m.depositIndex;
        m.totalDeposits += amount;
        if (!userMarketExists[msg.sender][asset]) {
            userMarkets[msg.sender].push(asset);
            userMarketExists[msg.sender][asset] = true;
        }
        emit Deposit(msg.sender, asset, amount);
    }

    function borrow(
        address asset,
        uint amount
    )
        external
        nonReentrant
        whenNotPaused
        onlySupportedMarket(asset)
        amountGreaterThanZero(amount)
    {
        accrueInterest(asset);
        Market storage m = markets[asset];
        Balance storage b = userBalances[msg.sender][asset];

        // Calculate max liquidity available for borrowing and ensure sufficient liquidity
        uint availableLiquidity = m.totalDeposits +
            treasuryBalances[asset] -
            m.totalBorrows;
        require(
            amount <= availableLiquidity,
            "Not enough liquidity in the market"
        );

        // Calculate total collateral and ensure user can borrow
        (uint totalDepositedUSD, uint totalBorrowedUSD) = getAccountLiquidity(
            msg.sender
        );
        uint assetPrice = IPriceRouter(priceRouter).getPrice(asset);
        uint decimals = IERC20Metadata(asset).decimals();
        uint amountUSD = (assetPrice * amount) / (10 ** decimals);
        require(
            (totalDepositedUSD * collateralFactor) / SCALE >=
                (totalBorrowedUSD + amountUSD),
            "Insufficient collateral"
        );
        // Update userBalances and totalBorrows
        uint currentBorrow = _currentUserBorrow(msg.sender, asset);
        b.borrowed = amount + currentBorrow;
        b.borrowIndexSnapShot = m.borrowIndex;
        m.totalBorrows += amount;
        if (!userMarketExists[msg.sender][asset]) {
            userMarkets[msg.sender].push(asset);
            userMarketExists[msg.sender][asset] = true;
        }
        IERC20(asset).safeTransfer(msg.sender, amount);
        emit Borrow(msg.sender, asset, amount);
    }

    function repay(
        address asset,
        uint amount
    )
        external
        nonReentrant
        whenNotPaused
        onlySupportedMarket(asset)
        amountGreaterThanZero(amount)
    {
        // Repay logic
        accrueInterest(asset);
        Market storage m = markets[asset];
        Balance storage b = userBalances[msg.sender][asset];
        // Update userBalances and totalBorrows
        uint currentBorrow = _currentUserBorrow(msg.sender, asset);
        require(currentBorrow > 0, "No borrow left");
        uint payAmount = amount;
        if (payAmount > currentBorrow) {
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

    function withdraw(
        address asset,
        uint amount // in asset decimals
    )
        external
        nonReentrant
        whenNotPaused
        onlySupportedMarket(asset)
        amountGreaterThanZero(amount)
    {
        accrueInterest(asset);
        Market storage m = markets[asset];
        Balance storage b = userBalances[msg.sender][asset];
        // Check user's deposit balance
        uint currentDeposit = _currentUserDeposit(msg.sender, asset);
        // Check if user has sufficient collateral after withdrawal
        uint maxAmountTokenWithdrawable = getMaxWithdrawAmount(
            msg.sender,
            asset
        );
        uint actualAmount = amount;
        if (actualAmount > maxAmountTokenWithdrawable) {
            actualAmount = maxAmountTokenWithdrawable;
        }
        if (actualAmount > currentDeposit) {
            actualAmount = currentDeposit;
        }
        // Update userBalances and totalDeposits
        uint newDeposit = currentDeposit - actualAmount;
        if (newDeposit == 0) {
            b.deposited = 0;
            b.depositIndexSnapShot = 0;
        } else {
            b.deposited = newDeposit;
            b.depositIndexSnapShot = m.depositIndex;
        }
        m.totalDeposits -= actualAmount;
        require(actualAmount > 0, "Nothing to withdraw");
        IERC20(asset).safeTransfer(msg.sender, actualAmount);
        emit Withdraw(msg.sender, asset, actualAmount);
    }

    // ─── Liquidation Hooks (onlyLiquidation) ──────────────────────────────────
    function seizeCollateral(
        address borrower,
        address collateralAsset,
        uint seizeAmount,
        address recipient
    )
        external
        nonReentrant
        whenNotPaused
        onlyLiquidation
        amountGreaterThanZero(seizeAmount)
    {
        accrueInterest(collateralAsset);
        Balance storage borrowerBalance = userBalances[borrower][
            collateralAsset
        ];
        Market storage m = markets[collateralAsset];
        uint currentBorrowerDeposit = _currentUserDeposit(
            borrower,
            collateralAsset
        );
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
    )
        external
        nonReentrant
        whenNotPaused
        onlyLiquidation
        amountGreaterThanZero(repayAmount)
    {
        accrueInterest(repayAsset);
        Market storage m = markets[repayAsset];
        Balance storage b = userBalances[borrower][repayAsset];
        // Update borrower balances
        uint currentBorrow = _currentUserBorrow(borrower, repayAsset);

        // repayAmount should not exceed currentBorrow: checked in Liquidation contract
        require(repayAmount <= currentBorrow, "Repay exceeds borrow");
        uint newBorrow = currentBorrow - repayAmount;
        if (newBorrow == 0) {
            b.borrowed = 0;
            b.borrowIndexSnapShot = 0;
        } else {
            b.borrowed = newBorrow;
            b.borrowIndexSnapShot = m.borrowIndex;
        }
        m.totalBorrows -= repayAmount;

        emit RepayFromLiquidation(borrower, repayAsset, repayAmount);
    }

    // ─── Internal Helpers ─────────────────────────────────────────────────────

    function _currentUserDeposit(
        address user,
        address asset
    ) internal view returns (uint) {
        Balance memory b = userBalances[user][asset];
        Market memory m = markets[asset];
        if (b.deposited == 0) return 0;
        if (b.depositIndexSnapShot == 0) return b.deposited;
        return (b.deposited * m.depositIndex) / b.depositIndexSnapShot;
    }

    function _currentUserBorrow(
        address user,
        address asset
    ) internal view returns (uint) {
        Balance memory b = userBalances[user][asset];
        Market memory m = markets[asset];
        if (b.borrowed == 0) return 0;
        if (b.borrowIndexSnapShot == 0) return b.borrowed;
        return (b.borrowed * m.borrowIndex) / b.borrowIndexSnapShot;
    }

    function _previewMarketAfterAccrual(
        address asset
    ) internal view returns (Market memory m) {
        m = markets[asset];
        require(m.isSupported, "Market not supported");

        uint timeElapsed = block.timestamp - m.lastUpdateTimestamp;
        if (timeElapsed == 0) return m;

        IInterestRateModel i = IInterestRateModel(m.interestRateModel);
        uint utilizationRate = getUtilizationRate(asset);
        uint borrowRate = i.getBorrowRate(utilizationRate);
        uint depositRate = i.getDepositRate(utilizationRate);

        uint interestAccrued = (m.totalBorrows * borrowRate * timeElapsed) /
            SECONDS_PER_YEAR /
            SCALE;
        m.totalBorrows += interestAccrued;
        uint borrowIndexIncrease = (m.borrowIndex * borrowRate * timeElapsed) /
            SECONDS_PER_YEAR /
            SCALE;
        m.borrowIndex += borrowIndexIncrease;

        uint depositInterestAccrued = (m.totalDeposits *
            depositRate *
            timeElapsed) /
            SECONDS_PER_YEAR /
            SCALE;
        m.totalDeposits += depositInterestAccrued;
        uint depositIndexIncrease = (m.depositIndex *
            depositRate *
            timeElapsed) /
            SECONDS_PER_YEAR /
            SCALE;
        m.depositIndex += depositIndexIncrease;

        m.lastUpdateTimestamp = block.timestamp;
    }

    function _previewUserDeposit(
        address user,
        address asset,
        Market memory m
    ) internal view returns (uint) {
        Balance memory b = userBalances[user][asset];
        if (b.deposited == 0) return 0;
        if (b.depositIndexSnapShot == 0) return b.deposited;
        return (b.deposited * m.depositIndex) / b.depositIndexSnapShot;
    }

    function _previewUserBorrow(
        address user,
        address asset,
        Market memory m
    ) internal view returns (uint) {
        Balance memory b = userBalances[user][asset];
        if (b.borrowed == 0) return 0;
        if (b.borrowIndexSnapShot == 0) return b.borrowed;
        return (b.borrowed * m.borrowIndex) / b.borrowIndexSnapShot;
    }

    // ─── View: Protocol State ─────────────────────────────────────────────────

    function getUtilizationRate(address asset) public view returns (uint) {
        Market memory market = markets[asset];
        if (market.totalDeposits == 0) return 0;
        return (market.totalBorrows * SCALE) / market.totalDeposits; // 18 decimals
    }

    function getMarketRates(
        address asset
    )
        external
        view
        returns (uint utilizationRate, uint depositRate, uint borrowRate)
    {
        Market memory m = markets[asset];
        require(m.isSupported, "Market not supported");
        utilizationRate = getUtilizationRate(asset);
        IInterestRateModel i = IInterestRateModel(m.interestRateModel);
        borrowRate = i.getBorrowRate(utilizationRate);
        depositRate = i.getDepositRate(utilizationRate);
    }

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
    function getMarketInfo(
        address asset
    )
        external
        view
        returns (
            uint totalDeposits,
            uint totalBorrows,
            uint depositRate,
            uint borrowRate,
            uint utilizationRate
        )
    {
        Market memory m = markets[asset];
        require(m.isSupported, "Market not supported");
        totalDeposits = m.totalDeposits;
        totalBorrows = m.totalBorrows;
        utilizationRate = getUtilizationRate(asset);
        borrowRate = IInterestRateModel(m.interestRateModel).getBorrowRate(
            utilizationRate
        );
        depositRate = IInterestRateModel(m.interestRateModel).getDepositRate(
            utilizationRate
        );
    }

    // ─── View: User State ─────────────────────────────────────────────────────

    function getUserCurrentDeposit(
        address user,
        address asset
    ) external view returns (uint) {
        return _currentUserDeposit(user, asset);
    }

    function getUserCurrentBorrow(
        address user,
        address asset
    ) external view returns (uint) {
        return _currentUserBorrow(user, asset);
    }

    function getPreviewUserDeposit(
        address user,
        address asset
    ) external view returns (uint) {
        Market memory m = _previewMarketAfterAccrual(asset);
        return _previewUserDeposit(user, asset, m);
    }

    function getPreviewUserBorrow(
        address user,
        address asset
    ) external view returns (uint) {
        Market memory m = _previewMarketAfterAccrual(asset);
        return _previewUserBorrow(user, asset, m);
    }

    function getMaxWithdrawAmount(
        address user,
        address asset
    ) public view returns (uint) {
        require(markets[asset].isSupported, "Market not supported");
        (uint totalDepositedUSD, uint totalBorrowedUSD) = getAccountLiquidity(
            user
        );

        uint assetPrice = IPriceRouter(priceRouter).getPrice(asset);
        uint decimals = IERC20Metadata(asset).decimals();
        // Guarded collateral math to avoid underflow:
        // requiredCollateralUSD = totalBorrowedUSD * SCALE / collateralFactor
        // maxUSD = max(totalDepositedUSD - requiredCollateralUSD, 0)
        uint requiredCollateralUSD = (totalBorrowedUSD * SCALE) /
            collateralFactor;
        uint maxAmountUSDWithdrawable = 0;
        if (totalDepositedUSD > requiredCollateralUSD) {
            maxAmountUSDWithdrawable =
                totalDepositedUSD -
                requiredCollateralUSD;
        }
        // Convert USD cap to token amount (token decimals)
        uint maxAmountTokenWithdrawable = (maxAmountUSDWithdrawable *
            (10 ** decimals)) / assetPrice; // in token decimals
        return maxAmountTokenWithdrawable;
    }

    function getAccountLiquidity(
        address user
    ) public view returns (uint totalDepositedUSD, uint totalBorrowedUSD) {
        IPriceRouter pr = IPriceRouter(priceRouter);
        address[] memory assets = userMarkets[user];
        for (uint i = 0; i < assets.length; i++) {
            address asset = assets[i];
            Market memory m = _previewMarketAfterAccrual(asset);
            uint currentDeposit = _previewUserDeposit(user, asset, m);
            uint currentBorrow = _previewUserBorrow(user, asset, m);
            uint assetPrice = pr.getPrice(asset);
            uint decimals = IERC20Metadata(asset).decimals();
            // Normalize to 18 decimals: (18 decimals price * token decimals) * 10^(18 - token decimals) / 10^18
            totalDepositedUSD +=
                (assetPrice * currentDeposit) /
                (10 ** decimals);
            totalBorrowedUSD += (assetPrice * currentBorrow) / (10 ** decimals);
        }
        return (totalDepositedUSD, totalBorrowedUSD);
    }

    function getAccountSnapshot(
        address user
    )
        external
        view
        returns (
            uint totalDepositedUSD,
            uint totalBorrowedUSD,
            uint netWorthUSD,
            uint healthFactor
        )
    {
        (totalDepositedUSD, totalBorrowedUSD) = getAccountLiquidity(user);
        uint liquidationThreshold = ILiquidation(liquidation)
            .liquidationThreshold();
        if (totalBorrowedUSD == 0) {
            healthFactor = type(uint).max;
        } else {
            healthFactor =
                (totalDepositedUSD * liquidationThreshold) /
                (totalBorrowedUSD * SCALE);
        }
        if (totalDepositedUSD >= totalBorrowedUSD) {
            netWorthUSD = totalDepositedUSD - totalBorrowedUSD;
        } else {
            netWorthUSD = 0;
        }
    }

    // ─── View: Simulation ─────────────────────────────────────────────────────

    function previewDeposit(
        address user,
        address asset,
        uint amount
    ) external view returns (uint totalDepositedUSD, uint newDepositedUSD) {
        require(markets[asset].isSupported, "Market not supported");
        require(amount > 0, "Amount must be greater than zero");
        (totalDepositedUSD, ) = getAccountLiquidity(user);
        uint assetPrice = IPriceRouter(priceRouter).getPrice(asset);
        uint decimals = IERC20Metadata(asset).decimals();
        uint amountUSD = (assetPrice * amount) / (10 ** decimals);
        newDepositedUSD = totalDepositedUSD + amountUSD;
    }

    function previewBorrow(
        address user,
        address asset,
        uint amount
    )
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
        uint amountUSD = (assetPrice * amount) / (10 ** decimals);
        newBorrowUSD = totalBorrowedUSD + amountUSD;
        if (newBorrowUSD == 0) {
            newHealthFactor = type(uint).max;
        } else {
            uint liquidationThreshold = ILiquidation(liquidation)
                .liquidationThreshold();
            newHealthFactor =
                (totalDepositedUSD * liquidationThreshold) /
                newBorrowUSD;
        }
    }

    function previewWithdraw(
        address user,
        address asset,
        uint amount
    )
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
        uint amountUSD = (assetPrice * amount) / (10 ** decimals);
        newDepositedUSD = totalDepositedUSD > amountUSD
            ? totalDepositedUSD - amountUSD
            : 0;
        if (totalBorrowedUSD == 0) {
            newHealthFactor = type(uint).max;
        } else {
            uint liquidationThreshold = ILiquidation(liquidation)
                .liquidationThreshold();
            newHealthFactor =
                (newDepositedUSD * liquidationThreshold) /
                totalBorrowedUSD;
        }
    }

    function previewRepay(
        address user,
        address asset,
        uint amount
    ) external view returns (uint totalBorrowedUSD, uint newBorrowedUSD) {
        require(markets[asset].isSupported, "Market not supported");
        require(amount > 0, "Amount must be greater than zero");
        (, totalBorrowedUSD) = getAccountLiquidity(user);
        uint assetPrice = IPriceRouter(priceRouter).getPrice(asset);
        uint decimals = IERC20Metadata(asset).decimals();
        uint amountUSD = (assetPrice * amount) / (10 ** decimals);
        newBorrowedUSD = totalBorrowedUSD > amountUSD
            ? totalBorrowedUSD - amountUSD
            : 0;
    }
}
