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

    mapping(address => bool) public isAdmin;

    address public lendingPool;

    // _______Event_______
    event LendingPoolSet(address indexed pool);
    event AdminSet(address indexed admin, bool allowed);

    // _______Constructor_______
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
        isAdmin[msg.sender] = true;
    }

    modifier onlyAdmin() {
        require(isAdmin[msg.sender], "Not an admin");
        _;
    }

    function setLendingPool(address _lendingPool) external onlyAdmin {
        require(_lendingPool != address(0), "Invalid pool");
        require(lendingPool == address(0), "Lending pool already set");
        lendingPool = _lendingPool;
        emit LendingPoolSet(_lendingPool);
    }

    function setAdmin(address admin, bool allowed) external onlyAdmin{
        isAdmin[admin] = allowed;
        emit AdminSet(admin, allowed);
    }

    function getBorrowRate(address asset) public view returns (uint) {
        uint utilizationRate = ILendingPool(lendingPool).getUtilizationRate(asset);
        if(utilizationRate == 0) return baseRate;
        if(utilizationRate <= optimalUtilization){
           return baseRate + utilizationRate * rateSlope1 / SCALE;
        } else {
           return baseRate + rateSlope1 * optimalUtilization / SCALE + 
                                            rateSlope2 * (utilizationRate - optimalUtilization) / SCALE;
        }
    }

    function getDepositRate(address asset) public view returns (uint) {
        uint borrowRate = getBorrowRate(asset);
        uint utilizationRate = ILendingPool(lendingPool).getUtilizationRate(asset);
        return (borrowRate * utilizationRate * (SCALE-reserveFactor)) / (SCALE * SCALE);
    }
}