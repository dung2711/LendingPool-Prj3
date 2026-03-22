// SPDX-License-Identifier: MIT

pragma solidity ^0.8.28;

contract MyOracle {
    event PriceUpdated(address indexed asset, uint price);

    mapping(address => uint) public prices; // asset => price in 18 decimals
    address public controller;

    constructor(address _controller) {
        require(_controller != address(0), "Invalid controller address");
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

    function setPrice(address asset, uint price) external onlyController {
        require(asset != address(0), "Invalid asset address");
        require(price > 0, "Price must be greater than zero");
        prices[asset] = price;
        emit PriceUpdated(asset, price);
    }

    function getPriceMyOracle(address asset) public view returns (uint) {
        require(prices[asset] > 0, "Price not set");
        return prices[asset]; // price in 18 decimals
    }
}
