// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {
    ILendingPool,
    IPriceRouter,
    IMyOracle,
    ILiquidation,
    IInterestRateModel
} from "./interfaces/Interfaces.sol";

contract ProtocolController is AccessControl {
    address public lendingPool;
    address public priceRouter;
    address public myOracle;
    address public liquidation;
    address public interestRateModel;

    event LendingPoolUpdated(
        address indexed oldAddress,
        address indexed newAddress
    );
    event PriceRouterUpdated(
        address indexed oldAddress,
        address indexed newAddress
    );
    event LiquidationUpdated(
        address indexed oldAddress,
        address indexed newAddress
    );
    event MyOracleUpdated(
        address indexed oldAddress,
        address indexed newAddress
    );

    constructor(
        address _lendingPool,
        address _priceRouter,
        address _myOracle,
        address _liquidation,
        address _interestRateModel,
        address _admin
    ) {
        require(_lendingPool != address(0), "Invalid lending pool");
        require(_priceRouter != address(0), "Invalid price router");
        require(_myOracle != address(0), "Invalid oracle");
        require(_liquidation != address(0), "Invalid liquidation");
        require(_admin != address(0), "Invalid admin");
        lendingPool = _lendingPool;
        priceRouter = _priceRouter;
        myOracle = _myOracle;
        liquidation = _liquidation;
        interestRateModel = _interestRateModel;
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
    }

    // Admin functions to update addresses in the protocol
    function migrateController(
        address newController
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newController != address(0), "Invalid controller address");
        IMyOracle(myOracle).setController(newController);
        IPriceRouter(priceRouter).setController(newController);
        ILiquidation(liquidation).setController(newController);
        IInterestRateModel(interestRateModel).setController(newController);
        ILendingPool(lendingPool).setController(newController);
    }

    function setLendingPool(
        address _lendingPool
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_lendingPool != address(0), "Invalid lending pool");
        ILiquidation(liquidation).setLendingPool(_lendingPool);
        IInterestRateModel(interestRateModel).setLendingPool(_lendingPool);
        emit LendingPoolUpdated(lendingPool, _lendingPool);
        lendingPool = _lendingPool;
    }

    function setPriceRouter(
        address _priceRouter
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_priceRouter != address(0), "Invalid price router");
        ILiquidation(liquidation).setPriceRouter(_priceRouter);
        ILendingPool(lendingPool).setPriceRouter(_priceRouter);
        emit PriceRouterUpdated(priceRouter, _priceRouter);
        priceRouter = _priceRouter;
    }

    function setLiquidation(
        address _liquidation
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_liquidation != address(0), "Invalid liquidation");
        ILendingPool(lendingPool).setLiquidation(_liquidation);
        emit LiquidationUpdated(liquidation, _liquidation);
        liquidation = _liquidation;
    }

    function setMyOracle(
        address _myOracle
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_myOracle != address(0), "Invalid oracle");
        IPriceRouter(priceRouter).setMyOracle(_myOracle);
        emit MyOracleUpdated(myOracle, _myOracle);
        myOracle = _myOracle;
    }

    // Admin functions in PriceRouter
    function setChainlinkFeed(
        address asset,
        address feed
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        IPriceRouter(priceRouter).setChainlinkFeed(asset, feed);
    }

    function setMyOracleFeed(
        address asset
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        IPriceRouter(priceRouter).setMyOracleFeed(asset);
    }

    function removeFeed(address asset) external onlyRole(DEFAULT_ADMIN_ROLE) {
        IPriceRouter(priceRouter).removeFeed(asset);
    }

    // Admin functions in Liquidation
    function setLiquidateParams(
        uint _liquidationThreshold,
        uint _closeFactor,
        uint _liquidationIncentive
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        ILiquidation(liquidation).setLiquidateParams(
            _liquidationThreshold,
            _closeFactor,
            _liquidationIncentive
        );
    }

    // Admin functions in MyOracle
    function setPrice(
        address asset,
        uint price
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        IMyOracle(myOracle).setPrice(asset, price);
    }

    // Admin functions in LendingPool
    function pauseLendingPool() external onlyRole(DEFAULT_ADMIN_ROLE) {
        ILendingPool(lendingPool).pause();
    }

    function unpauseLendingPool() external onlyRole(DEFAULT_ADMIN_ROLE) {
        ILendingPool(lendingPool).unpause();
    }

    function supportMarket(
        address asset,
        address irm
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        ILendingPool(lendingPool).supportMarket(asset, irm);
    }

    function unsupportMarket(
        address asset
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        ILendingPool(lendingPool).unsupportMarket(asset);
    }

    function setCollateralParams(
        uint _collateralFactor
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        ILendingPool(lendingPool).setCollateralParams(_collateralFactor);
    }

    // Proxy upgrade functions
    function upgradePriceRouter(
        address newImplementation
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        IPriceRouter(priceRouter).upgradeToAndCall(newImplementation, "");
    }

    function upgradeLendingPool(
        address newImplementation
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        ILendingPool(lendingPool).upgradeToAndCall(newImplementation, "");
    }
}
