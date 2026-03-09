// SPDX-License-Identifier: MIT

pragma solidity ^0.8.28;

import {
    AggregatorV3Interface
} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import {
    IERC20Metadata
} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

import {IMyOracle} from "./interfaces/Interfaces.sol";

contract PriceRouter is AccessControl {
    // PriceRouter contract code goes here
    event FeedSet(address indexed asset, address feedOrToken, Source source);
    event FeedRemoved(address indexed asset);
    event MyOracleUpdated(address indexed newMyOracle);

    enum Source {
        CHAINLINK,
        MYORACLE,
        NONE
    }

    struct FeedInfo {
        Source source;
        address feedOrToken;
    }

    mapping(address => FeedInfo) public feeds;

    address public myOracle;

    constructor(address _myOracle) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        myOracle = _myOracle;
    }

    function setAdmin(
        address admin,
        bool status
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (status) {
            _grantRole(DEFAULT_ADMIN_ROLE, admin);
        } else {
            _revokeRole(DEFAULT_ADMIN_ROLE, admin);
        }
    }

    function setMyOracle(
        address _myOracle
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        myOracle = _myOracle;
        emit MyOracleUpdated(_myOracle);
    }

    function setChainlinkFeed(
        address asset,
        address feed
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        feeds[asset] = FeedInfo({source: Source.CHAINLINK, feedOrToken: feed});
        emit FeedSet(asset, feed, Source.CHAINLINK);
    }

    function setMyOracleFeed(
        address asset
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        feeds[asset] = FeedInfo({source: Source.MYORACLE, feedOrToken: asset});
        emit FeedSet(asset, asset, Source.MYORACLE);
    }

    function removeFeed(address asset) external onlyRole(DEFAULT_ADMIN_ROLE) {
        feeds[asset] = FeedInfo({source: Source.NONE, feedOrToken: address(0)});
        emit FeedRemoved(asset);
    }

    function getPrice(address asset) public view returns (uint) {
        require(feeds[asset].source != Source.NONE, "No price feed available");
        FeedInfo memory feedInfo = feeds[asset];
        if (feedInfo.source == Source.CHAINLINK) {
            AggregatorV3Interface priceFeed = AggregatorV3Interface(
                feedInfo.feedOrToken
            );
            (, int price, , , ) = priceFeed.latestRoundData();
            require(price > 0, "Invalid price from Chainlink");
            uint feedDecimal = priceFeed.decimals();
            if (feedDecimal > 18) {
                price = price / int(10 ** (feedDecimal - 18));
            } else {
                price = price * int(10 ** (18 - feedDecimal));
            }
            return uint(price); // Normalize to 18 decimals
        } else if (feedInfo.source == Source.MYORACLE) {
            uint price = IMyOracle(myOracle).getPriceMyOracle(
                feedInfo.feedOrToken
            );
            return price;
        } else {
            revert("Invalid price source");
        }
    }
}
