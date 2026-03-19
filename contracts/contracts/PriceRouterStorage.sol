// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract PriceRouterStorage {
    enum Source {
        CHAINLINK,
        MYORACLE,
        NONE
    }

    struct FeedInfo {
        Source source;
        address feedOrToken;
    }

    mapping(address => FeedInfo) public feeds; // asset => FeedInfo

    address public myOracle;

    uint256[50] private __gap;
}
