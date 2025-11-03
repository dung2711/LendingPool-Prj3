// SPDX-License-Identidier: MIT

pragma solidity ^0.8.28;

interface ILendingPool {
    function accrueInterest(address asset) external;
    function getAccountLiquidity(address user) external view returns (uint totalDepositedUSD, uint totalBorrowedUSD);
    function getUserCurrentDeposit(address user, address asset) external view returns (uint);
    function getUserCurrentBorrow(address user, address asset) external view returns (uint);
    function repayFromLiquidation(
        address borrower,
        address repayAsset,
        uint repayAmount
    ) external;
    function seizeCollateral(
        address borrower,
        address collateralAsset,
        uint seizeAmount,
        address recipient
    ) external;
}

interface IPriceRouter {
    function getPrice(address asset) external view returns (uint);
}

interface IMyOracle {
    function getPriceMyOracle(address asset) external view returns (uint);
}

interface ILiquidation {
    function isAccountLiquidatable(address user) public view returns (bool);
    function getCloseFactor() external view returns (uint);
    function calculateSeizeAmount(
        address repayAsset,
        address collateralAsset,
        uint repayAmount
    ) public view returns (uint seizeAmount);
}

interface IInterestRateModel {
    function getBorrowRate(address asset) external view returns (uint);
    function getDepositRate(address asset) external view returns (uint)
}
