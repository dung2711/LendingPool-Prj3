// SPDX-License-Identifier: MIT

pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IPriceRouter, ILendingPool} from "./interfaces/Interfaces.sol";

contract Liquidation is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Liquidation contract code goes here
    uint public constant SCALE = 1e18;

    event LiquidationExecuted(
        address indexed liquidator,
        address indexed borrower,
        address repayAsset,
        address collateralAsset,
        uint repayAmount,
        uint seizeAmount
    );

    uint public liquidationThreshold; // 18 decimal
    uint public closeFactor; // 18 decimal
    uint public liquidationIncentive; // 18 decimal

    address public priceRouter;
    address public lendingPool;

    mapping(address => bool) public isAdmin;

    constructor(
        address _priceRouter,
        address _lendingPool,
        uint _liquidationThreshold,
        uint _closeFactor,
        uint _liquidationIncentive
    ) {
        priceRouter = _priceRouter;
        lendingPool = _lendingPool;
        liquidationThreshold = _liquidationThreshold;
        closeFactor = _closeFactor;
        liquidationIncentive = _liquidationIncentive;
        isAdmin[msg.sender] = true;
    }

    modifier onlyAdmin() {
        require(isAdmin[msg.sender], "Not an admin");
        _;
    }

    /// Config functions
    function setAdmin(address admin, bool status) external onlyAdmin {
        isAdmin[admin] = status;
    }

    function setPriceRouter(address _priceRouter) external onlyAdmin {
        priceRouter = _priceRouter;
    }

    function setLendingPool(address _lendingPool) external onlyAdmin {
        lendingPool = _lendingPool;
    }

    function setLiquidateParams(
        uint _liquidationThreshold,
        uint _closeFactor,
        uint _liquidationIncentive
    ) external onlyAdmin {
        liquidationThreshold = _liquidationThreshold;
        closeFactor = _closeFactor;
        liquidationIncentive = _liquidationIncentive;
    }

    /// Helpers
    function isAccountLiquidatable(address user) public view returns (bool) {
        (uint totalDepositedUSD, uint totalBorrowedUSD) = ILendingPool(lendingPool).getAccountLiquidity(user);
        if(totalDepositedUSD == 0){
            return false;
        }
        if (totalBorrowedUSD * SCALE / totalDepositedUSD >= liquidationThreshold) {
            return true;
        }
        return false;
    }

    function getCloseFactor() external view returns (uint) {
        return closeFactor;
    }

    /// Core logic
    function calculateSeizeAmount(
        address repayAsset,
        address collateralAsset,
        uint repayAmount
    ) public view returns (uint seizeAmount) {
        IPriceRouter pr = IPriceRouter(priceRouter);
        uint priceBorrowed = pr.getPrice(repayAsset);
        uint priceCollateral = pr.getPrice(collateralAsset);
        require(priceBorrowed > 0 && priceCollateral > 0, "Invalid asset price");
        seizeAmount = repayAmount * (SCALE + liquidationIncentive) * priceBorrowed / (priceCollateral * SCALE);
    }

    function liquidate(
        address borrower,
        address liquidator,
        address repayAsset,
        address collateralAsset,
        uint repayAmount
    ) external nonReentrant {
        require(borrower != address(0) && liquidator != address(0), "Zero address");
        require(repayAmount > 0, "Repay amount must be greater than zero");
        require(lendingPool != address(0) && priceRouter != address(0), "LendingPool or PriceRouter not set");

        ILendingPool lendingPoolContract = ILendingPool(lendingPool);
        lendingPoolContract.accrueInterest(repayAsset);
        lendingPoolContract.accrueInterest(collateralAsset);
        
        require(isAccountLiquidatable(borrower), "Account is not liquidatable");
        uint currentBorrow = lendingPoolContract.getUserCurrentBorrow(borrower, repayAsset);
        uint maxRepayAmount = currentBorrow * closeFactor / SCALE;
        uint actualRepayAmount = repayAmount > maxRepayAmount ? maxRepayAmount : repayAmount;
        // Transfer repayAmount of repayAsset from liquidator to LendingPool
        IERC20(repayAsset).safeTransferFrom(liquidator, lendingPool, actualRepayAmount);
        // Update borrower's borrow balance in LendingPool
        lendingPoolContract.repayFromLiquidation(borrower, repayAsset, actualRepayAmount);
        // Calculate seize amount
        uint seizeAmount = calculateSeizeAmount(repayAsset, collateralAsset, actualRepayAmount);
        uint borrowerDeposit = lendingPoolContract.getUserCurrentDeposit(borrower, collateralAsset);
        if(seizeAmount > borrowerDeposit){
            seizeAmount = borrowerDeposit;
        }
        require(seizeAmount > 0, "Seize amount is zero");
        // Update borrower's collateral balance in LendingPool
        lendingPoolContract.seizeCollateral(borrower, collateralAsset, seizeAmount, liquidator);

        emit LiquidationExecuted(
            liquidator,
            borrower,
            repayAsset,
            collateralAsset,
            repayAmount,
            seizeAmount
        );
    }
}