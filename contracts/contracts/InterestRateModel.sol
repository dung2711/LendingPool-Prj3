// SPDX-License-Identifier: MIT

pragma solidity ^0.8.28;

import {ILendingPool} from "./interfaces/Interfaces.sol";

contract InterestRateModel {
    uint constant SCALE = 1e18;

    // _______State_______
    uint public immutable baseRate; // e.g. 0.02e18 = 2% base rate
    uint public immutable rateSlope1; // e.g. 0.08e18 = 8%
    uint public immutable rateSlope2; // e.g. 1.00e18 = 100%
    uint public immutable optimalUtilization; // e.g. 0.8e18 = 80%
    uint public immutable reserveFactor; // e.g. 0.1e18 = 10%

    constructor(
        uint _baseRate,
        uint _rateSlope1,
        uint _rateSlope2,
        uint _optimalUtilization,
        uint _reserveFactor
    ) {
        require(_optimalUtilization <= 1e18, "Invalid optimal utilization");
        require(_reserveFactor <= 1e18, "Invalid reserve factor");
        baseRate = _baseRate;
        rateSlope1 = _rateSlope1;
        rateSlope2 = _rateSlope2;
        optimalUtilization = _optimalUtilization;
        reserveFactor = _reserveFactor;
    }

    function getBorrowRate(uint utilizationRate) public view returns (uint) {
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

    function getDepositRate(uint utilizationRate) public view returns (uint) {
        uint borrowRate = getBorrowRate(utilizationRate);
        return
            (borrowRate * utilizationRate * (SCALE - reserveFactor)) /
            (SCALE * SCALE);
    }
}
