// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ClimbEscrowTestBase} from "./ClimbEscrow.Base.t.sol";
import {ClimbEscrow} from "../ClimbEscrow.sol";

contract ClimbEscrowFundsTest is ClimbEscrowTestBase {
    // ---------- cancel / refund ----------

    function test_Cancel_EveryContributorRefundsExactly_SecondRefundReverts() public {
        uint256 id = _openBounty(); // creator 10, bob 5, carol 3
        uint256 cBefore = usdc.balanceOf(creator);
        uint256 bBefore = usdc.balanceOf(bob);
        uint256 kBefore = usdc.balanceOf(carol);

        vm.expectEmit(true, true, false, true, address(escrow));
        emit ClimbEscrow.BountyCancelled(id, creator);
        vm.prank(creator);
        escrow.cancelBounty(id);
        assertEq(uint8(_status(id)), uint8(ClimbEscrow.Status.Cancelled));

        vm.expectEmit(true, true, false, true, address(escrow));
        emit ClimbEscrow.RefundClaimed(id, bob, 5 * U);
        vm.prank(bob);
        escrow.claimRefund(id);
        vm.prank(carol);
        escrow.claimRefund(id);
        vm.prank(creator);
        escrow.claimRefund(id);

        assertEq(usdc.balanceOf(bob) - bBefore, 5 * U);
        assertEq(usdc.balanceOf(carol) - kBefore, 3 * U);
        assertEq(usdc.balanceOf(creator) - cBefore, 10 * U);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        assertEq(escrow.getBounty(id).totalFunds, 0);
        assertEq(usdc.balanceOf(treasury), 0, "no fee on refunds");

        vm.prank(bob);
        vm.expectRevert(ClimbEscrow.NothingToRefund.selector);
        escrow.claimRefund(id);
        vm.prank(creator);
        vm.expectRevert(ClimbEscrow.NothingToRefund.selector);
        escrow.claimRefund(id);
    }

    function test_Refund_NonContributorReverts() public {
        uint256 id = _openBounty();
        vm.prank(creator);
        escrow.cancelBounty(id);
        vm.prank(stranger);
        vm.expectRevert(ClimbEscrow.NothingToRefund.selector);
        escrow.claimRefund(id);
    }

    function test_Refund_BeforeCancelReverts() public {
        uint256 id = _openBounty();
        vm.prank(bob);
        vm.expectRevert(ClimbEscrow.InvalidBountyStatus.selector);
        escrow.claimRefund(id);
    }

    function test_Cancel_SoloRefundsCreator() public {
        uint256 id = _create(false, 7 * U);
        uint256 before = usdc.balanceOf(creator);
        vm.startPrank(creator);
        escrow.cancelBounty(id);
        escrow.claimRefund(id);
        vm.stopPrank();
        assertEq(usdc.balanceOf(creator) - before, 7 * U);
    }

    function test_Cancel_OnlyCreator() public {
        uint256 id = _openBounty();
        vm.prank(bob);
        vm.expectRevert(ClimbEscrow.NotBountyCreator.selector);
        escrow.cancelBounty(id);
    }

    function test_Cancel_OnPaidAndCancelledReverts() public {
        uint256 id = _create(false, 5 * U);
        uint256 c0 = _claim(alice, id);
        vm.startPrank(creator);
        escrow.acceptClaim(id, c0);
        vm.expectRevert(ClimbEscrow.InvalidBountyStatus.selector);
        escrow.cancelBounty(id);
        uint256 id2 = escrow.createBounty("t", "d", "c", U, false);
        escrow.cancelBounty(id2);
        vm.expectRevert(ClimbEscrow.InvalidBountyStatus.selector);
        escrow.cancelBounty(id2);
        vm.stopPrank();
    }

    function test_Paid_CannotRefundOrWithdraw() public {
        uint256 id = _openBounty();
        uint256 c0 = _claim(alice, id);
        _nominate(id, c0);
        _vote(creator, id, true);
        skip(48 hours);
        escrow.resolveVote(id);
        vm.prank(bob);
        vm.expectRevert(ClimbEscrow.InvalidBountyStatus.selector);
        escrow.claimRefund(id);
        vm.prank(bob);
        vm.expectRevert(ClimbEscrow.InvalidBountyStatus.selector);
        escrow.withdrawContribution(id);
    }

    // ---------- withdraw ----------

    function test_Withdraw_ContributorGetsFullAmount() public {
        uint256 id = _openBounty();
        _contribute(bob, id, 2 * U); // bob total 7
        uint256 before = usdc.balanceOf(bob);
        vm.expectEmit(true, true, false, true, address(escrow));
        emit ClimbEscrow.ContributionWithdrawn(id, bob, 7 * U);
        vm.prank(bob);
        escrow.withdrawContribution(id);
        assertEq(usdc.balanceOf(bob) - before, 7 * U);
        assertEq(escrow.getContribution(id, bob), 0);
        assertEq(escrow.getBounty(id).totalFunds, 13 * U);
        assertEq(usdc.balanceOf(address(escrow)), 13 * U);

        vm.prank(bob);
        vm.expectRevert(ClimbEscrow.NothingToWithdraw.selector);
        escrow.withdrawContribution(id);
    }

    function test_Withdraw_CreatorCannot() public {
        uint256 id = _openBounty();
        vm.prank(creator);
        vm.expectRevert(ClimbEscrow.CreatorCannotWithdraw.selector);
        escrow.withdrawContribution(id);
    }

    function test_Withdraw_NonContributorReverts() public {
        uint256 id = _openBounty();
        vm.prank(stranger);
        vm.expectRevert(ClimbEscrow.NothingToWithdraw.selector);
        escrow.withdrawContribution(id);
    }

    function test_Withdraw_SoloReverts() public {
        uint256 id = _create(false, 5 * U);
        vm.prank(bob);
        vm.expectRevert(ClimbEscrow.OpenBountyRequired.selector);
        escrow.withdrawContribution(id);
    }

    function test_Withdraw_ThenVoteHasNoWeight() public {
        uint256 id = _openBounty();
        uint256 c0 = _claim(alice, id);
        vm.prank(bob);
        escrow.withdrawContribution(id);
        _nominate(id, c0);
        vm.prank(bob);
        vm.expectRevert(ClimbEscrow.NoContribution.selector);
        escrow.vote(id, true);
    }

    // ---------- admin ----------

    function test_Owner_SetTreasuryAndFee() public {
        address nt = makeAddr("newTreasury");
        vm.expectEmit(true, true, false, true, address(escrow));
        emit ClimbEscrow.TreasuryUpdated(treasury, nt);
        vm.prank(owner);
        escrow.setTreasury(nt);
        assertEq(escrow.treasury(), nt);

        vm.expectEmit(false, false, false, true, address(escrow));
        emit ClimbEscrow.FeeUpdated(FEE, 500);
        vm.prank(owner);
        escrow.setFeeBps(500);
        assertEq(escrow.feeBps(), 500);
        vm.prank(owner);
        escrow.setFeeBps(0);
        assertEq(escrow.feeBps(), 0);
    }

    function test_Owner_SetFeeAboveMaxReverts() public {
        vm.prank(owner);
        vm.expectRevert(ClimbEscrow.FeeTooHigh.selector);
        escrow.setFeeBps(501);
    }

    function test_Owner_SetTreasuryZeroReverts() public {
        vm.prank(owner);
        vm.expectRevert(ClimbEscrow.ZeroAddress.selector);
        escrow.setTreasury(address(0));
    }

    function test_NonOwner_CannotSet() public {
        vm.startPrank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        escrow.setFeeBps(100);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        escrow.setTreasury(stranger);
        vm.stopPrank();
        // creator is not privileged either
        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, creator));
        escrow.setFeeBps(100);
    }

    function test_Owner_FeeChangeAppliesAtPayout() public {
        uint256 id = _create(false, 100 * U);
        uint256 c0 = _claim(alice, id);
        vm.prank(owner);
        escrow.setFeeBps(500);
        vm.prank(creator);
        escrow.acceptClaim(id, c0);
        assertEq(usdc.balanceOf(treasury), 5 * U);
        assertEq(usdc.balanceOf(alice), WALLET + 95 * U);
    }

    function test_Owner_CannotTouchEscrowedFunds() public {
        uint256 id = _openBounty();
        _claim(alice, id);
        uint256 escrowBal = usdc.balanceOf(address(escrow));
        uint256 ownerBal = usdc.balanceOf(owner);

        // Owner has no privileged path on bounties.
        vm.startPrank(owner);
        vm.expectRevert(ClimbEscrow.NotBountyCreator.selector);
        escrow.cancelBounty(id);
        vm.expectRevert(ClimbEscrow.NothingToWithdraw.selector);
        escrow.withdrawContribution(id);
        vm.expectRevert(ClimbEscrow.NothingPending.selector);
        escrow.withdrawPending();
        vm.expectRevert(ClimbEscrow.InvalidBountyStatus.selector);
        escrow.claimRefund(id);
        vm.expectRevert(ClimbEscrow.NotBountyCreator.selector);
        escrow.nominateClaim(id, 0);

        // Probe plausible rescue/sweep selectors: none exist, so each call fails.
        bytes[7] memory probes = [
            abi.encodeWithSignature("rescueTokens(address,uint256)", address(usdc), escrowBal),
            abi.encodeWithSignature("rescueFunds(address,uint256)", address(usdc), escrowBal),
            abi.encodeWithSignature("emergencyWithdraw()"),
            abi.encodeWithSignature("emergencyWithdraw(address,uint256)", address(usdc), escrowBal),
            abi.encodeWithSignature("sweep(address)", address(usdc)),
            abi.encodeWithSignature("withdraw(uint256)", escrowBal),
            abi.encodeWithSignature("withdrawFees()")
        ];
        for (uint256 i; i < probes.length; ++i) {
            (bool ok,) = address(escrow).call(probes[i]);
            assertFalse(ok, "unexpected privileged function");
        }
        vm.stopPrank();

        assertEq(usdc.balanceOf(address(escrow)), escrowBal);
        assertEq(usdc.balanceOf(owner), ownerBal);
        assertEq(escrow.getBounty(id).totalFunds, 18 * U);
    }

    // ---------- deferred payouts ----------

    function test_Deferred_BlockedClaimant_PaidPendingThenWithdraw() public {
        uint256 id = _create(false, 100 * U);
        uint256 c0 = _claim(alice, id);
        usdc.setRevertTo(alice, true);

        vm.expectEmit(true, true, false, true, address(escrow));
        emit ClimbEscrow.PayoutDeferred(id, alice, 97_500_000);
        vm.prank(creator);
        escrow.acceptClaim(id, c0);

        assertEq(uint8(_status(id)), uint8(ClimbEscrow.Status.Paid));
        assertEq(escrow.pendingPayouts(alice), 97_500_000);
        assertEq(usdc.balanceOf(treasury), 2_500_000);
        assertEq(usdc.balanceOf(address(escrow)), 97_500_000);

        // still blocked: withdrawPending reverts atomically and keeps the credit
        vm.prank(alice);
        vm.expectRevert();
        escrow.withdrawPending();
        assertEq(escrow.pendingPayouts(alice), 97_500_000);

        usdc.setRevertTo(alice, false);
        vm.expectEmit(true, false, false, true, address(escrow));
        emit ClimbEscrow.PendingWithdrawn(alice, 97_500_000);
        vm.prank(alice);
        escrow.withdrawPending();
        assertEq(usdc.balanceOf(alice), WALLET + 97_500_000);
        assertEq(escrow.pendingPayouts(alice), 0);
        assertEq(usdc.balanceOf(address(escrow)), 0);

        vm.prank(alice);
        vm.expectRevert(ClimbEscrow.NothingPending.selector);
        escrow.withdrawPending();
    }

    function test_Deferred_TokenReturningFalse_StillPaidAndCredited() public {
        uint256 id = _create(false, 100 * U);
        uint256 c0 = _claim(alice, id);
        usdc.setFalseTo(alice, true);
        vm.prank(creator);
        escrow.acceptClaim(id, c0);
        assertEq(uint8(_status(id)), uint8(ClimbEscrow.Status.Paid));
        assertEq(escrow.pendingPayouts(alice), 97_500_000);
    }

    function test_Deferred_RejectingTreasury_DoesNotBlockSettlement() public {
        uint256 id = _create(false, 100 * U);
        uint256 c0 = _claim(alice, id);
        usdc.setRevertTo(treasury, true);

        vm.expectEmit(true, true, false, true, address(escrow));
        emit ClimbEscrow.PayoutDeferred(id, treasury, 2_500_000);
        vm.prank(creator);
        escrow.acceptClaim(id, c0);

        assertEq(uint8(_status(id)), uint8(ClimbEscrow.Status.Paid));
        assertEq(usdc.balanceOf(alice), WALLET + 97_500_000);
        assertEq(escrow.pendingPayouts(treasury), 2_500_000);

        usdc.setRevertTo(treasury, false);
        vm.prank(treasury);
        escrow.withdrawPending();
        assertEq(usdc.balanceOf(treasury), 2_500_000);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_Deferred_OpenVoteRejectingClaimantAndTreasury() public {
        uint256 id = _openBounty();
        uint256 c0 = _claim(alice, id);
        _nominate(id, c0);
        _vote(creator, id, true);
        usdc.setRevertTo(alice, true);
        usdc.setRevertTo(treasury, true);
        skip(48 hours);
        escrow.resolveVote(id);
        assertEq(uint8(_status(id)), uint8(ClimbEscrow.Status.Paid));
        assertEq(escrow.pendingPayouts(alice), 17_550_000);
        assertEq(escrow.pendingPayouts(treasury), 450_000);
        assertEq(usdc.balanceOf(address(escrow)), 18 * U);
    }

    function test_ZeroFee_PaysEverythingToClaimant() public {
        vm.prank(owner);
        escrow.setFeeBps(0);
        uint256 id = _create(false, 10 * U);
        uint256 c0 = _claim(alice, id);
        vm.prank(creator);
        escrow.acceptClaim(id, c0);
        assertEq(usdc.balanceOf(alice), WALLET + 10 * U);
        assertEq(usdc.balanceOf(treasury), 0);
    }
}
