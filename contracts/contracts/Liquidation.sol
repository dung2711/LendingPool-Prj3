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
    ReentrancyGuard
} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IPriceRouter, ILendingPool} from "./interfaces/Interfaces.sol";

contract Liquidation is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint public constant SCALE = 1e18;

    event LiquidationParamsUpdated(
        uint liquidationThreshold,
        uint closeFactor,
        uint liquidationIncentive
    );
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

    address public controller;
    address public priceRouter;
    address public lendingPool;

    modifier onlyController() {
        require(msg.sender == controller, "Only controller can call");
        _;
    }

    constructor(
        address _priceRouter,
        address _lendingPool,
        uint _liquidationThreshold,
        uint _closeFactor,
        uint _liquidationIncentive,
        address _controller
    ) {
        priceRouter = _priceRouter;
        lendingPool = _lendingPool;
        liquidationThreshold = _liquidationThreshold;
        closeFactor = _closeFactor;
        liquidationIncentive = _liquidationIncentive;
        controller = _controller;
    }

    function setController(address _controller) external onlyController {
        require(_controller != address(0), "Invalid controller address");
        controller = _controller;
    }

    function setPriceRouter(address _priceRouter) external onlyController {
        priceRouter = _priceRouter;
    }

    function setLendingPool(address _lendingPool) external onlyController {
        lendingPool = _lendingPool;
    }

    function setLiquidateParams(
        uint _liquidationThreshold,
        uint _closeFactor,
        uint _liquidationIncentive
    ) external onlyController {
        liquidationThreshold = _liquidationThreshold;
        closeFactor = _closeFactor;
        liquidationIncentive = _liquidationIncentive;
        emit LiquidationParamsUpdated(
            _liquidationThreshold,
            _closeFactor,
            _liquidationIncentive
        );
    }

    /// Helpers
    function isAccountLiquidatable(address user) public view returns (bool) {
        (uint totalDepositedUSD, uint totalBorrowedUSD) = ILendingPool(
            lendingPool
        ).getAccountLiquidity(user);
        if (totalDepositedUSD == 0) {
            return false;
        }
        if (
            (totalBorrowedUSD * SCALE) / totalDepositedUSD >=
            liquidationThreshold
        ) {
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
        require(
            priceBorrowed > 0 && priceCollateral > 0,
            "Invalid asset price"
        );
        seizeAmount =
            (repayAmount * (SCALE + liquidationIncentive) * priceBorrowed) /
            (priceCollateral * SCALE);
    }

    function liquidate(
        address borrower,
        address liquidator,
        address repayAsset,
        address collateralAsset,
        uint repayAmount
    ) external nonReentrant {
        require(
            borrower != address(0) && liquidator != address(0),
            "Zero address"
        );
        require(repayAmount > 0, "Repay amount must be greater than zero");
        require(
            lendingPool != address(0) && priceRouter != address(0),
            "LendingPool or PriceRouter not set"
        );

        ILendingPool lendingPoolContract = ILendingPool(lendingPool);
        lendingPoolContract.accrueInterest(repayAsset);
        lendingPoolContract.accrueInterest(collateralAsset);

        require(isAccountLiquidatable(borrower), "Account is not liquidatable");
        uint currentBorrow = lendingPoolContract.getUserCurrentBorrow(
            borrower,
            repayAsset
        );
        uint maxRepayAmount = (currentBorrow *
            (10 ** (18 - IERC20Metadata(repayAsset).decimals())) *
            closeFactor) / SCALE; // convert to 18 decimals
        uint actualRepayAmount = repayAmount > maxRepayAmount
            ? maxRepayAmount
            : repayAmount;
        // Transfer repayAmount of repayAsset from liquidator to LendingPool
        IERC20(repayAsset).safeTransferFrom(
            liquidator,
            lendingPool,
            actualRepayAmount
        );
        // Update borrower's borrow balance in LendingPool
        lendingPoolContract.repayFromLiquidation(
            borrower,
            repayAsset,
            actualRepayAmount
        );
        // Calculate seize amount
        uint seizeAmountIn18decimals = calculateSeizeAmount(
            repayAsset,
            collateralAsset,
            actualRepayAmount
        );
        uint seizeAmount = (seizeAmountIn18decimals *
            (10 ** IERC20Metadata(collateralAsset).decimals())) / SCALE; // convert back to collateral asset decimals
        // Check borrower's collateral balance
        uint borrowerDeposit = lendingPoolContract.getUserCurrentDeposit(
            borrower,
            collateralAsset
        );
        if (seizeAmount > borrowerDeposit) {
            seizeAmount = borrowerDeposit;
        }
        require(seizeAmount > 0, "Seize amount is zero");
        // Update borrower's collateral balance in LendingPool
        lendingPoolContract.seizeCollateral(
            borrower,
            collateralAsset,
            seizeAmount,
            liquidator
        );

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
