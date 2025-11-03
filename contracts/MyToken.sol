// SPDX-License-Identifier: MIT

pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract MyToken is ERC20, ERC20Permit, Ownable {
    constructor() ERC20("MyToken", "VNDT") ERC20Permit("MyToken") Ownable(msg.sender){
        _mint(msg.sender, 1000000 * 10 ** decimals());
    }

    function mint(address to, uint amount) external onlyOwner{
        _mint(to, amount);
    }
}
