// SPDX-License-Identifier: MIT

pragma solidity ^0.8.28;

import {
    AggregatorV3Interface
} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import {
    Initializable
} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {
    UUPSUpgradeable
} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {IMyOracle} from "./interfaces/Interfaces.sol";
import {PriceRouterStorage} from "./PriceRouterStorage.sol";

contract PriceRouter is Initializable, UUPSUpgradeable, PriceRouterStorage {
    event FeedSet(address indexed asset, address feedOrToken, Source source);
    event FeedRemoved(address indexed asset);

    modifier onlyController() {
        require(msg.sender == controller, "Only controller can call");
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _myOracle,
        address _controller
    ) public initializer {
        require(_myOracle != address(0), "Invalid oracle");
        require(_controller != address(0), "Invalid controller");
        myOracle = _myOracle;
        controller = _controller;
    }

    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyController {}

    function setController(address _controller) external onlyController {
        require(_controller != address(0), "Invalid controller address");
        controller = _controller;
    }

    function setMyOracle(address _myOracle) external onlyController {
        myOracle = _myOracle;
    }

    function setChainlinkFeed(
        address asset,
        address feed
    ) external onlyController {
        feeds[asset] = FeedInfo({source: Source.CHAINLINK, feedOrToken: feed});
        emit FeedSet(asset, feed, Source.CHAINLINK);
    }

    function setMyOracleFeed(address asset) external onlyController {
        feeds[asset] = FeedInfo({source: Source.MYORACLE, feedOrToken: asset});
        emit FeedSet(asset, asset, Source.MYORACLE);
    }

    function removeFeed(address asset) external onlyController {
        feeds[asset] = FeedInfo({source: Source.NONE, feedOrToken: address(0)});
        emit FeedRemoved(asset);
    }

    function getPrice(address asset) public view returns (uint) {
        FeedInfo memory feedInfo = feeds[asset];
        require(feedInfo.source != Source.NONE, "No price feed available");
        if (feedInfo.source == Source.CHAINLINK) {
            AggregatorV3Interface priceFeed = AggregatorV3Interface(
                feedInfo.feedOrToken
            );
            (
                uint80 roundId,
                int chainlinkPrice,
                ,
                uint updatedAt,
                uint80 answeredInRound
            ) = priceFeed.latestRoundData();
            require(updatedAt > 0, "Round not complete");
            require(answeredInRound >= roundId, "Stale price");
            require(chainlinkPrice > 0, "Invalid price from Chainlink");
            uint feedDecimal = priceFeed.decimals();
            if (feedDecimal > 18) {
                chainlinkPrice = chainlinkPrice / int(10 ** (feedDecimal - 18));
            } else {
                chainlinkPrice = chainlinkPrice * int(10 ** (18 - feedDecimal));
            }
            return uint(chainlinkPrice); // Normalize to 18 decimals
        }

        return IMyOracle(myOracle).getPriceMyOracle(feedInfo.feedOrToken);
    }
}
