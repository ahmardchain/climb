// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ClimbEscrow} from "../ClimbEscrow.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";

/// @dev Bounded random-action driver. Contains no test_/invariant_ functions.
contract ClimbEscrowHandler is Test {
    ClimbEscrow public escrow;
    MockERC20 public usdc;
    address[] public actors;
    uint256 public constant MAX_BOUNTIES = 6;

    constructor(ClimbEscrow e, MockERC20 t) {
        escrow = e;
        usdc = t;
        for (uint256 i; i < 5; ++i) {
            address a = makeAddr(string.concat("actor", vm.toString(i)));
            actors.push(a);
            usdc.mint(a, 1e15);
            vm.prank(a);
            usdc.approve(address(e), type(uint256).max);
        }
    }

    function _actor(uint256 s) internal view returns (address) {
        return actors[s % actors.length];
    }

    function _bounty(uint256 s) internal view returns (uint256) {
        uint256 n = escrow.bountyCount();
        return n == 0 ? 0 : (s % n) + 1;
    }

    function create(uint256 a, uint256 amount, bool isOpen) external {
        if (escrow.bountyCount() >= MAX_BOUNTIES) return;
        amount = bound(amount, 1e6, 1e9);
        vm.prank(_actor(a));
        escrow.createBounty("t", "d", "c", amount, isOpen);
    }

    function contribute(uint256 a, uint256 b, uint256 amount) external {
        amount = bound(amount, 1e5, 1e9);
        uint256 id = _bounty(b);
        vm.prank(_actor(a));
        try escrow.contribute(id, amount) {} catch {}
    }

    function withdraw(uint256 a, uint256 b) external {
        uint256 id = _bounty(b);
        vm.prank(_actor(a));
        try escrow.withdrawContribution(id) {} catch {}
    }

    function submitClaim(uint256 a, uint256 b) external {
        uint256 id = _bounty(b);
        vm.prank(_actor(a));
        try escrow.submitClaim(id, "ipfs://p", "n") {} catch {}
    }

    function nominate(uint256 b, uint256 c) external {
        uint256 id = _bounty(b);
        if (id == 0) return;
        address cr = escrow.getBounty(id).creator;
        uint256 n = escrow.claimCount(id);
        if (n == 0) return;
        vm.prank(cr);
        try escrow.nominateClaim(id, c % n) {} catch {}
    }

    function accept(uint256 b, uint256 c) external {
        uint256 id = _bounty(b);
        if (id == 0) return;
        address cr = escrow.getBounty(id).creator;
        uint256 n = escrow.claimCount(id);
        if (n == 0) return;
        vm.prank(cr);
        try escrow.acceptClaim(id, c % n) {} catch {}
    }

    function castVote(uint256 a, uint256 b, bool support) external {
        uint256 id = _bounty(b);
        vm.prank(_actor(a));
        try escrow.vote(id, support) {} catch {}
    }

    function resolve(uint256 b) external {
        try escrow.resolveVote(_bounty(b)) {} catch {}
    }

    function cancel(uint256 b) external {
        uint256 id = _bounty(b);
        if (id == 0) return;
        address cr = escrow.getBounty(id).creator;
        vm.prank(cr);
        try escrow.cancelBounty(id) {} catch {}
    }

    function refund(uint256 a, uint256 b) external {
        uint256 id = _bounty(b);
        vm.prank(_actor(a));
        try escrow.claimRefund(id) {} catch {}
    }

    function warp(uint256 secs) external {
        skip(bound(secs, 1, 60 hours));
    }

    /// @dev Sum of totalFunds over all bounties.
    function sumTotalFunds() external view returns (uint256 s) {
        uint256 n = escrow.bountyCount();
        for (uint256 id = 1; id <= n; ++id) {
            s += escrow.getBounty(id).totalFunds;
        }
    }

    /// @dev For every non-Paid bounty, totalFunds must equal the sum of recorded contributions.
    function contributionsMatchTotals() external view returns (bool) {
        uint256 n = escrow.bountyCount();
        for (uint256 id = 1; id <= n; ++id) {
            ClimbEscrow.Bounty memory b = escrow.getBounty(id);
            if (b.status == ClimbEscrow.Status.Paid) continue;
            address[] memory cs = escrow.getContributors(id);
            uint256 sum;
            for (uint256 i; i < cs.length; ++i) {
                sum += escrow.getContribution(id, cs[i]);
            }
            if (sum != b.totalFunds) return false;
        }
        return true;
    }
}
