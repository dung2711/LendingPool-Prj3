// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract LendingPoolStorage {
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    uint public constant SECONDS_PER_YEAR = 60 * 60 * 24 * 365;
    uint public constant SCALE = 1e18;

    struct Market {
        bool isSupported;
        uint totalDeposits;
        uint totalBorrows;
        uint borrowIndex;
        uint depositIndex;
        uint lastUpdateTimestamp;
        address interestRateModel;
    }

    struct Balance {
        uint deposited;
        uint borrowed;
        uint borrowIndexSnapShot;
        uint depositIndexSnapShot;
    }

    uint public collateralFactor;
    address public liquidation;
    address public priceRouter;

    mapping(address => Market) public markets; // asset => Market
    address[] public allMarkets; // list of all supported assets
    mapping(address => bool) public marketExists; // asset => exists
    mapping(address => mapping(address => Balance)) public userBalances; // user => asset => Balance
    mapping(address => address[]) public userMarkets; // user => list of assets
    mapping(address => mapping(address => bool)) public userMarketExists; // user => asset => exists

    uint256[50] private __gap;
}
