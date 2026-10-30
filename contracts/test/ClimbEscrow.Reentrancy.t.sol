// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ClimbEscrowTestBase} from "./ClimbEscrow.Base.t.sol";
import {ClimbEscrow} from "../ClimbEscrow.sol";
import {MaliciousToken} from "../test-helpers/MaliciousToken.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// Each test arms a one-shot token callback that re-enters the escrow as a LEGITIMATE actor
/// (so only the reentrancy guard, not an access check, can stop it) during the token transfer.
contract ClimbEscrowReentrancyTest is ClimbEscrowTestBase {
    MaliciousToken internal evil;

    function setUp() public override {
        evil = new MaliciousToken();
        _deployWith(evil);
    }

    function _assertBlocked() internal view {
        assertTrue(evil.fired(), "callback never fired");
        assertFalse(evil.attackSucceeded(), "reentrant call succeeded");
        assertEq(
            bytes4(evil.attackReturn()), ReentrancyGuard.ReentrancyGuardReentrantCall.selector, "blocked by guard"
        );
    }

    function test_Reenter_AcceptClaimPayout() public {
        uint256 id = _create(false, 100 * U);
        uint256 c0 = _claim(alice, id);
        evil.arm(address(escrow), creator, abi.encodeCall(ClimbEscrow.acceptClaim, (id, c0)));

        vm.prank(creator);
        escrow.acceptClaim(id, c0);

        _assertBlocked();
        assertEq(usdc.balanceOf(alice), WALLET + 97_500_000);
        assertEq(usdc.balanceOf(treasury), 2_500_000);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        assertEq(uint8(_status(id)), uint8(ClimbEscrow.Status.Paid));
    }

    function test_Reenter_ResolveVotePayout() public {
        uint256 id = _openBounty();
        uint256 c0 = _claim(alice, id);
        _nominate(id, c0);
        _vote(creator, id, true);
        skip(48 hours);
        evil.arm(address(escrow), stranger, abi.encodeCall(ClimbEscrow.resolveVote, (id)));

        escrow.resolveVote(id);

        _assertBlocked();
        assertEq(usdc.balanceOf(alice), WALLET + 17_550_000);
        assertEq(usdc.balanceOf(treasury), 450_000);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_Reenter_PayoutCallbackCannotWithdrawPending() public {
        // claimant's callback tries to pull pending funds / cancel during payout
        uint256 id = _create(false, 100 * U);
        uint256 c0 = _claim(alice, id);
        evil.arm(address(escrow), alice, abi.encodeCall(ClimbEscrow.withdrawPending, ()));
        vm.prank(creator);
        escrow.acceptClaim(id, c0);
        _assertBlocked();
        assertEq(usdc.balanceOf(alice), WALLET + 97_500_000);
    }

    function test_Reenter_ClaimRefund() public {
        uint256 id = _openBounty();
        vm.prank(creator);
        escrow.cancelBounty(id);
        evil.arm(address(escrow), bob, abi.encodeCall(ClimbEscrow.claimRefund, (id)));

        uint256 before = usdc.balanceOf(bob);
        vm.prank(bob);
        escrow.claimRefund(id);

        _assertBlocked();
        assertEq(usdc.balanceOf(bob) - before, 5 * U, "refunded exactly once");
        assertEq(usdc.balanceOf(address(escrow)), 13 * U);
        assertEq(escrow.getBounty(id).totalFunds, 13 * U);
    }

    function test_Reenter_WithdrawContribution() public {
        uint256 id = _openBounty();
        evil.arm(address(escrow), bob, abi.encodeCall(ClimbEscrow.withdrawContribution, (id)));

        uint256 before = usdc.balanceOf(bob);
        vm.prank(bob);
        escrow.withdrawContribution(id);

        _assertBlocked();
        assertEq(usdc.balanceOf(bob) - before, 5 * U);
        assertEq(usdc.balanceOf(address(escrow)), 13 * U);
        assertEq(escrow.getBounty(id).totalFunds, 13 * U);
    }

    function test_Reenter_WithdrawPending() public {
        uint256 id = _create(false, 100 * U);
        uint256 c0 = _claim(alice, id);
        evil.setRevertTo(alice, true);
        vm.prank(creator);
        escrow.acceptClaim(id, c0);
        evil.setRevertTo(alice, false);
        assertEq(escrow.pendingPayouts(alice), 97_500_000);

        evil.arm(address(escrow), alice, abi.encodeCall(ClimbEscrow.withdrawPending, ()));
        vm.prank(alice);
        escrow.withdrawPending();

        _assertBlocked();
        assertEq(usdc.balanceOf(alice), WALLET + 97_500_000, "paid exactly once");
        assertEq(escrow.pendingPayouts(alice), 0);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_Reenter_CreateBountyTransferFrom() public {
        evil.arm(address(escrow), creator, abi.encodeCall(ClimbEscrow.contribute, (1, 1e5)));
        uint256 id = _create(true, 10 * U);
        _assertBlocked();
        assertEq(id, 1);
        assertEq(escrow.getBounty(id).totalFunds, 10 * U);
        assertEq(usdc.balanceOf(address(escrow)), 10 * U);
    }

    function test_Reenter_ContributeTransferFrom() public {
        uint256 id = _create(true, 10 * U);
        evil.arm(address(escrow), bob, abi.encodeCall(ClimbEscrow.contribute, (id, 1e5)));
        _contribute(bob, id, 2 * U);
        _assertBlocked();
        assertEq(escrow.getBounty(id).totalFunds, 12 * U);
        assertEq(usdc.balanceOf(address(escrow)), 12 * U);
    }
}
