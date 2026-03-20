// SPDX-License-Identifier: MIT

pragma solidity ^0.8.28;

import {ILendingPool} from "./interfaces/Interfaces.sol";

contract InterestRateModel {
    uint constant SCALE = 1e18;

    // _______State_______
    uint public baseRate; // e.g. 0.02e18 = 2% base rate
    uint public rateSlope1; // e.g. 0.08e18 = 8%
    uint public rateSlope2; // e.g. 1.00e18 = 100%
    uint public optimalUtilization; // e.g. 0.8e18 = 80%
    uint public reserveFactor; // e.g. 0.1e18 = 10%

    address public controller;
    address public lendingPool;

    constructor(
        uint _baseRate,
        uint _rateSlope1,
        uint _rateSlope2,
        uint _optimalUtilization,
        uint _reserveFactor,
        address _controller
    ) {
        require(_optimalUtilization <= 1e18, "Invalid optimal utilization");
        require(_reserveFactor <= 1e18, "Invalid reserve factor");
        baseRate = _baseRate;
        rateSlope1 = _rateSlope1;
        rateSlope2 = _rateSlope2;
        optimalUtilization = _optimalUtilization;
        reserveFactor = _reserveFactor;
        controller = _controller;
    }

    modifier onlyController() {
        require(msg.sender == controller, "Only controller can call");
        _;
    }

    function setController(address _controller) external onlyController {
        require(_controller != address(0), "Invalid controller address");
        controller = _controller;
    }

    function setLendingPool(address _lendingPool) external onlyController {
        require(_lendingPool != address(0), "Invalid pool");
        lendingPool = _lendingPool;
    }

    function getBorrowRate(address asset) public view returns (uint) {
        uint utilizationRate = ILendingPool(lendingPool).getUtilizationRate(
            asset
        );
        if (utilizationRate == 0) return 0;
        if (utilizationRate <= optimalUtilization) {
            return baseRate + (utilizationRate * rateSlope1) / SCALE;
        } else {
            return
                baseRate +
                (rateSlope1 * optimalUtilization) /
                SCALE +
                (rateSlope2 * (utilizationRate - optimalUtilization)) /
                SCALE;
        }
    }

    function getDepositRate(address asset) public view returns (uint) {
        uint borrowRate = getBorrowRate(asset);
        uint utilizationRate = ILendingPool(lendingPool).getUtilizationRate(
            asset
        );
        return
            (borrowRate * utilizationRate * (SCALE - reserveFactor)) /
            (SCALE * SCALE);
    }
}
