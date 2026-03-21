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
        require(_priceRouter != address(0), "Invalid price router");
        require(_lendingPool != address(0), "Invalid lending pool");
        require(_controller != address(0), "Invalid controller");
        require(
            _liquidationThreshold > 0 && _liquidationThreshold <= SCALE,
            "Invalid threshold"
        );
        require(
            _closeFactor > 0 && _closeFactor <= SCALE,
            "Invalid close factor"
        );
        require(
            _liquidationIncentive > 0 && _liquidationIncentive <= 0.2e18,
            "Incentive too high"
        );
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
        require(
            _liquidationThreshold > 0 && _liquidationThreshold <= SCALE,
            "Invalid threshold"
        );
        require(
            _closeFactor > 0 && _closeFactor <= SCALE,
            "Invalid close factor"
        );
        require(_liquidationIncentive <= 0.2e18, "Incentive too high");
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
        return
            (totalBorrowedUSD * SCALE) / totalDepositedUSD >=
            liquidationThreshold;
    }

    /// Core logic
    function calculateSeizeAmount(
        address repayAsset,
        address collateralAsset,
        uint repayAmount // token decimals của repayAsset
    ) public view returns (uint seizeAmount) {
        IPriceRouter pr = IPriceRouter(priceRouter);
        uint priceBorrowed = pr.getPrice(repayAsset);
        uint priceCollateral = pr.getPrice(collateralAsset);
        require(
            priceBorrowed > 0 && priceCollateral > 0,
            "Invalid asset price"
        );
        uint repayDecimals = IERC20Metadata(repayAsset).decimals();
        uint collateralDecimals = IERC20Metadata(collateralAsset).decimals();

        // normalize repayAmount lên 18 decimals
        uint repayAmount18 = repayDecimals <= 18
            ? repayAmount * (10 ** (18 - repayDecimals))
            : repayAmount / (10 ** (repayDecimals - 18));

        // tính ở 18 decimals — lúc này price ratio triệt tiêu đúng
        uint seizeAmount18 = (repayAmount18 *
            (SCALE + liquidationIncentive) *
            priceBorrowed) / (priceCollateral * SCALE);

        // convert về collateral token decimals
        seizeAmount = collateralDecimals <= 18
            ? seizeAmount18 / (10 ** (18 - collateralDecimals))
            : seizeAmount18 * (10 ** (collateralDecimals - 18));
    }

    function liquidate(
        address borrower,
        address liquidator,
        address repayAsset,
        address collateralAsset,
        uint repayAmount // token decimals của repayAsset
    ) external nonReentrant {
        require(
            borrower != address(0) && liquidator != address(0),
            "Zero address"
        );
        require(repayAmount > 0, "Repay amount must be greater than zero");

        ILendingPool lendingPoolContract = ILendingPool(lendingPool);
        lendingPoolContract.accrueInterest(repayAsset);
        lendingPoolContract.accrueInterest(collateralAsset);

        require(isAccountLiquidatable(borrower), "Account is not liquidatable");
        uint currentBorrow = lendingPoolContract.getUserCurrentBorrow(
            borrower,
            repayAsset
        );
        uint maxRepayAmount = (currentBorrow * closeFactor) / SCALE; // convert to 18 decimals
        uint actualRepayAmount = repayAmount > maxRepayAmount
            ? maxRepayAmount
            : repayAmount;

        IERC20(repayAsset).safeTransferFrom(
            liquidator,
            lendingPool,
            actualRepayAmount
        );

        lendingPoolContract.repayFromLiquidation(
            borrower,
            repayAsset,
            actualRepayAmount
        );

        uint seizeAmount = calculateSeizeAmount(
            repayAsset,
            collateralAsset,
            actualRepayAmount
        );

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
            actualRepayAmount,
            seizeAmount
        );
    }
}
