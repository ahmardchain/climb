// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Vm} from "forge-std/Vm.sol";
import {MockERC20} from "./MockERC20.sol";

/// @notice ERC20 whose next non-mint balance update calls back into a target as `attacker`.
/// The callback is one-shot and uses a low-level call so the outcome can be inspected.
contract MaliciousToken is MockERC20 {
    Vm private constant VM = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    address public target;
    address public attacker;
    bytes public data;
    bool public armed;
    bool public fired;
    bool public attackSucceeded;
    bytes public attackReturn;

    constructor() MockERC20("Evil USDC", "eUSDC", 6) {}

    /// @param t contract to re-enter
    /// @param who address the callback impersonates (a legitimate actor for the call)
    /// @param d calldata of the reentrant call
    function arm(address t, address who, bytes calldata d) external {
        target = t;
        attacker = who;
        data = d;
        armed = true;
        fired = false;
        attackSucceeded = false;
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (armed && from != address(0)) {
            armed = false;
            fired = true;
            VM.prank(attacker);
            (bool ok, bytes memory ret) = target.call(data);
            attackSucceeded = ok;
            attackReturn = ret;
        }
    }
}
