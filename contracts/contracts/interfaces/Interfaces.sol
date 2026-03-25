// SPDX-License-Identifier: MIT

pragma solidity ^0.8.28;

interface ILendingPool {
    function accrueInterest(address asset) external;
    function getUtilizationRate(address asset) external view returns (uint);
    function getAccountLiquidity(
        address user
    ) external view returns (uint totalDepositedUSD, uint totalBorrowedUSD);
    function getUserCurrentDeposit(
        address user,
        address asset
    ) external view returns (uint);
    function getUserCurrentBorrow(
        address user,
        address asset
    ) external view returns (uint);
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
    function setController(address _controller) external;
    function setLiquidation(address _liquidation) external;
    function setPriceRouter(address _priceRouter) external;
    function pause() external;
    function unpause() external;
    function supportMarket(address asset, address interestRateModel) external;
    function unsupportMarket(address asset) external;
    function setCollateralParams(uint _collateralFactor) external;
    function upgradeToAndCall(
        address newImplementation,
        bytes calldata data
    ) external;
    function setInterestRateModel(
        address asset,
        address interestRateModel
    ) external;
    function withdrawTreasury(address asset, address to, uint amount) external;
    function rescueToken(address token, address to, uint amount) external;
}

interface IPriceRouter {
    function getPrice(address asset) external view returns (uint);
    function setController(address _controller) external;
    function setMyOracle(address _myOracle) external;
    function setChainlinkFeed(address asset, address feed) external;
    function setMyOracleFeed(address asset) external;
    function removeFeed(address asset) external;
    function upgradeToAndCall(
        address newImplementation,
        bytes calldata data
    ) external;
}

interface IMyOracle {
    function getPriceMyOracle(address asset) external view returns (uint);
    function setController(address _controller) external;
    function setPrice(address asset, uint price) external;
}

interface ILiquidation {
    function isAccountLiquidatable(address user) external view returns (bool);
    function calculateSeizeAmount(
        address repayAsset,
        address collateralAsset,
        uint repayAmount
    ) external view returns (uint seizeAmount);
    function liquidationThreshold() external view returns (uint);
    function setController(address _controller) external;
    function setPriceRouter(address _priceRouter) external;
    function setLendingPool(address _lendingPool) external;
    function setLiquidateParams(
        uint _liquidationThreshold,
        uint _closeFactor,
        uint _liquidationIncentive
    ) external;
}

interface IInterestRateModel {
    function getBorrowRate(uint utilizationRate) external view returns (uint);
    function getDepositRate(uint utilizationRate) external view returns (uint);
}
