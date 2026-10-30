// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ClimbEscrowTestBase} from "./ClimbEscrow.Base.t.sol";
import {ClimbEscrowHandler} from "./ClimbEscrow.Handler.t.sol";
import {ClimbEscrow} from "../ClimbEscrow.sol";

contract ClimbEscrowFuzzTest is ClimbEscrowTestBase {
    function testFuzz_Solo_PayoutPlusFeeEqualsTotal(uint256 amount, uint16 feeBps) public {
        amount = bound(amount, 1e6, 1e12);
        feeBps = uint16(bound(feeBps, 0, 500));
        vm.prank(owner);
        escrow.setFeeBps(feeBps);

        uint256 id = _create(false, amount);
        uint256 c0 = _claim(alice, id);
        uint256 aBefore = usdc.balanceOf(alice);
        uint256 tBefore = usdc.balanceOf(treasury);

        vm.prank(creator);
        escrow.acceptClaim(id, c0);

        uint256 payout = usdc.balanceOf(alice) - aBefore;
        uint256 fee = usdc.balanceOf(treasury) - tBefore;
        assertEq(payout + fee, amount, "payout + fee == totalFunds");
        assertEq(fee, (amount * feeBps) / 10_000);
        assertLe(fee, amount / 20); // never more than 5%
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function testFuzz_Open_PayoutPlusFeeEqualsTotal(uint256 a0, uint256 a1, uint256 a2, uint16 feeBps) public {
        a0 = bound(a0, 1e6, 1e12);
        a1 = bound(a1, 1e5, 1e12);
        a2 = bound(a2, 1e5, 1e12);
        feeBps = uint16(bound(feeBps, 0, 500));
        vm.prank(owner);
        escrow.setFeeBps(feeBps);

        uint256 id = _create(true, a0);
        _contribute(bob, id, a1);
        _contribute(carol, id, a2);
        uint256 total = a0 + a1 + a2;
        uint256 c0 = _claim(alice, id);
        _nominate(id, c0);
        _vote(creator, id, true);
        skip(48 hours);
        uint256 aBefore = usdc.balanceOf(alice);
        uint256 tBefore = usdc.balanceOf(treasury);
        escrow.resolveVote(id);

        assertEq((usdc.balanceOf(alice) - aBefore) + (usdc.balanceOf(treasury) - tBefore), total);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function testFuzz_Cancel_RefundsExactContributions(uint256 a0, uint256 a1, uint256 a2) public {
        a0 = bound(a0, 1e6, 1e12);
        a1 = bound(a1, 1e5, 1e12);
        a2 = bound(a2, 1e5, 1e12);
        uint256 id = _create(true, a0);
        _contribute(bob, id, a1);
        _contribute(carol, id, a2);
        vm.prank(creator);
        escrow.cancelBounty(id);
        uint256 cB = usdc.balanceOf(creator);
        uint256 bB = usdc.balanceOf(bob);
        uint256 kB = usdc.balanceOf(carol);
        vm.prank(creator);
        escrow.claimRefund(id);
        vm.prank(bob);
        escrow.claimRefund(id);
        vm.prank(carol);
        escrow.claimRefund(id);
        assertEq(usdc.balanceOf(creator) - cB, a0);
        assertEq(usdc.balanceOf(bob) - bB, a1);
        assertEq(usdc.balanceOf(carol) - kB, a2);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    /// Random contribute/withdraw sequence: token balance always equals the sum of live totalFunds.
    function testFuzz_ContributeWithdrawSequence_BalanceMatchesTotalFunds(uint256[] memory ops) public {
        uint256 id1 = _create(true, 5 * U);
        uint256 id2 = _create(true, 3 * U);
        address[3] memory actors = [bob, carol, stranger];
        uint256 n = ops.length > 40 ? 40 : ops.length;
        for (uint256 i; i < n; ++i) {
            uint256 op = ops[i];
            address who = actors[op % 3];
            uint256 id = ((op >> 8) % 2 == 0) ? id1 : id2;
            if ((op >> 16) % 2 == 0) {
                uint256 amt = bound(op >> 32, 1e5, 1e9);
                _contribute(who, id, amt);
            } else {
                vm.prank(who);
                try escrow.withdrawContribution(id) {} catch {}
            }
            uint256 live = escrow.getBounty(id1).totalFunds + escrow.getBounty(id2).totalFunds;
            assertEq(usdc.balanceOf(address(escrow)), live);
        }
        // totals equal the sum of per-address contributions
        uint256 sum;
        address[4] memory all = [creator, bob, carol, stranger];
        for (uint256 i; i < all.length; ++i) {
            sum += escrow.getContribution(id1, all[i]) + escrow.getContribution(id2, all[i]);
        }
        assertEq(sum, usdc.balanceOf(address(escrow)));
    }

    /// Random action sequence through the handler (all entry points): balance == sum of totalFunds.
    function testFuzz_HandlerSequence_BalanceMatchesTotalFunds(uint256[] memory ops) public {
        ClimbEscrowHandler h = new ClimbEscrowHandler(escrow, usdc);
        uint256 n = ops.length > 60 ? 60 : ops.length;
        for (uint256 i; i < n; ++i) {
            uint256 op = ops[i];
            uint256 k = op % 11;
            uint256 x = op >> 8;
            uint256 y = op >> 24;
            if (k == 0) h.create(x, y, (op >> 40) % 2 == 0);
            else if (k == 1) h.contribute(x, y, op >> 40);
            else if (k == 2) h.withdraw(x, y);
            else if (k == 3) h.submitClaim(x, y);
            else if (k == 4) h.nominate(x, y);
            else if (k == 5) h.accept(x, y);
            else if (k == 6) h.castVote(x, y, (op >> 40) % 2 == 0);
            else if (k == 7) h.resolve(x);
            else if (k == 8) h.cancel(x);
            else if (k == 9) h.refund(x, y);
            else h.warp(y);
            assertEq(usdc.balanceOf(address(escrow)), h.sumTotalFunds());
        }
        assertTrue(h.contributionsMatchTotals());
    }
}
