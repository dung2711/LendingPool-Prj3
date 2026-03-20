// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

abstract contract PriceRouterStorage {
    enum Source {
        CHAINLINK,
        MYORACLE,
        NONE
    }
    struct FeedInfo {
        Source source;
        address feedOrToken;
    }
    address public controller;
    mapping(address => FeedInfo) public feeds; // asset => FeedInfo
    address public myOracle;
    uint256[47] private __gap;
}
