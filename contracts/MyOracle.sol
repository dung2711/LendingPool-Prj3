// SPDX-License-Identifier: MIT

pragma solidity ^0.8.28;

import {MyToken} from "./MyToken.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract MyOracle is Ownable {
    event PriceUpdated(address indexed asset, uint price);

    mapping(address => uint) public prices; // asset => price in 18 decimals

    constructor() Ownable(msg.sender) {}

    function setPrice(address asset, uint price) external onlyOwner {
        require(asset != address(0), "Invalid asset address");
        require(price > 0, "Price must be greater than zero");
        prices[asset] = price;
        emit PriceUpdated(asset, price);
    }

    function getPriceMyOracle(address asset) public view returns (uint) {
        return prices[asset]; // price in 18 decimals   
    }
}