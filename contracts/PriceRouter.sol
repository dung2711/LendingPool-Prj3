// SPDX-License-Identifier: MIT

pragma solidity ^0.8.28;

import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {IMyOracle} from "./interfaces/Interfaces.sol";

contract PriceRouter is Ownable {
    // PriceRouter contract code goes here
    event FeedSet(address indexed asset, address feedOrToken, Source source);
    event FeedRemoved(address indexed asset);
    event MyOracleUpdated(address indexed newMyOracle);

    enum Source { CHAINLINK, MYORACLE, NONE }

    struct FeedInfo{
        Source source;
        address feedOrToken;
    }   

    mapping(address => FeedInfo) public feeds;

    address public myOracle;

    constructor(address _myOracle) Ownable(msg.sender) {
        myOracle = _myOracle;
    }

    function setMyOracle(address _myOracle) external onlyOwner {
        myOracle = _myOracle;
        emit MyOracleUpdated(_myOracle);
    }

    function setChainlinkFeed(address asset, address feed) external onlyOwner {
        feeds[asset] = FeedInfo({source: Source.CHAINLINK, feedOrToken: feed});
        emit FeedSet(asset, feed, Source.CHAINLINK);
    }

    function setMyOracleFeed(address asset) external onlyOwner {
        feeds[asset] = FeedInfo({source: Source.MYORACLE, feedOrToken: asset});
        emit FeedSet(asset, asset, Source.MYORACLE);
    }

    function removeFeed(address asset) external onlyOwner {
        feeds[asset] = FeedInfo({source: Source.NONE, feedOrToken: address(0)});
        emit FeedRemoved(asset);
    }

    function getPrice(address asset) public view returns (uint){
        require(feeds[asset].source != Source.NONE, "No price feed available");
        FeedInfo memory feedInfo = feeds[asset];
        if(feedInfo.source == Source.CHAINLINK){
            AggregatorV3Interface priceFeed = AggregatorV3Interface(feedInfo.feedOrToken);
            (,int price,,,) = priceFeed.latestRoundData();
            uint decimal = IERC20Metadata(asset).decimals();
            if(decimal > 18){
                price = price / int(10 ** (decimal - 18));
            } else {
                price = price * int(10 ** (18 - decimal));
            }
            return uint(price); // Normalize to 18 decimals
        } else if(feedInfo.source == Source.MYORACLE){
            // Assuming MyOracle has a function getPriceMyOracle(address token) returns (uint)
            uint price = IMyOracle(myOracle).getPriceMyOracle(feedInfo.feedOrToken);
            uint decimal = IERC20Metadata(asset).decimals();
            if(decimal > 18){
                return price / (10 ** (decimal - 18)); // Normalize to 18 decimals
            } else {
                return price * (10 ** (18 - decimal)); // Normalize to 18 decimals
            }
        } else {
            revert("Invalid price source");
        }
    }
}
