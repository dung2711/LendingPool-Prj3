// SPDX-License-Identifier: MIT

pragma solidity ^0.8.28;

import {MyToken} from "./MyToken.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
contract MyOracle is AccessControl {
    event PriceUpdated(address indexed asset, uint price);

    mapping(address => uint) public prices; // asset => price in 18 decimals

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
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

    function setPrice(
        address asset,
        uint price
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(asset != address(0), "Invalid asset address");
        require(price > 0, "Price must be greater than zero");
        prices[asset] = price;
        emit PriceUpdated(asset, price);
    }

    function getPriceMyOracle(address asset) public view returns (uint) {
        return prices[asset]; // price in 18 decimals
    }
}
