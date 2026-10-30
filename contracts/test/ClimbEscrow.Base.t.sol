// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ClimbEscrow} from "../ClimbEscrow.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";

abstract contract ClimbEscrowTestBase is Test {
    ClimbEscrow internal escrow;
    MockERC20 internal usdc;

    address internal owner = makeAddr("owner");
    address internal treasury = makeAddr("treasury");
    address internal creator = makeAddr("creator");
    address internal alice = makeAddr("alice"); // claimant
    address internal dave = makeAddr("dave"); // second claimant
    address internal bob = makeAddr("bob"); // contributor
    address internal carol = makeAddr("carol"); // contributor
    address internal stranger = makeAddr("stranger");

    uint16 internal constant FEE = 250;
    uint256 internal constant U = 1e6; // 1 USDC
    uint256 internal constant WALLET = 1_000_000e6;

    function setUp() public virtual {
        _deployWith(new MockERC20("Mock USDC", "mUSDC", 6));
    }

    function _deployWith(MockERC20 token) internal {
        usdc = token;
        escrow = new ClimbEscrow(address(usdc), treasury, FEE, owner);
        address[7] memory who = [creator, alice, dave, bob, carol, stranger, owner];
        for (uint256 i; i < who.length; ++i) {
            usdc.mint(who[i], WALLET);
            vm.prank(who[i]);
            usdc.approve(address(escrow), type(uint256).max);
        }
    }

    // ---------------- helpers ----------------

    function _create(bool isOpen, uint256 amount) internal returns (uint256 id) {
        vm.prank(creator);
        id = escrow.createBounty("Climb the wall", "desc", "general", amount, isOpen);
    }

    function _contribute(address who, uint256 id, uint256 amount) internal {
        vm.prank(who);
        escrow.contribute(id, amount);
    }

    function _claim(address who, uint256 id) internal returns (uint256 claimId) {
        vm.prank(who);
        claimId = escrow.submitClaim(id, "ipfs://proof", "note");
    }

    function _nominate(uint256 id, uint256 claimId) internal {
        vm.prank(creator);
        escrow.nominateClaim(id, claimId);
    }

    function _vote(address who, uint256 id, bool support) internal {
        vm.prank(who);
        escrow.vote(id, support);
    }

    /// @dev Open bounty: creator 10, bob 5, carol 3 USDC (total 18). Returns id.
    function _openBounty() internal returns (uint256 id) {
        id = _create(true, 10 * U);
        _contribute(bob, id, 5 * U);
        _contribute(carol, id, 3 * U);
    }

    function _fee(uint256 total) internal view returns (uint256) {
        return (total * escrow.feeBps()) / 10_000;
    }

    function _status(uint256 id) internal view returns (ClimbEscrow.Status) {
        return escrow.getBounty(id).status;
    }
}
