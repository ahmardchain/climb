// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ClimbEscrowTestBase} from "./ClimbEscrow.Base.t.sol";
import {ClimbEscrow} from "../ClimbEscrow.sol";

contract ClimbEscrowFlowTest is ClimbEscrowTestBase {
    // ---------- deployment ----------

    function test_Deploy_SetsState() public view {
        assertEq(address(escrow.usdc()), address(usdc));
        assertEq(escrow.treasury(), treasury);
        assertEq(escrow.feeBps(), FEE);
        assertEq(escrow.owner(), owner);
        assertEq(usdc.decimals(), 6);
    }

    function test_Deploy_RevertsOnFeeAboveMax() public {
        vm.expectRevert(ClimbEscrow.FeeTooHigh.selector);
        new ClimbEscrow(address(usdc), treasury, 501, owner);
    }

    function test_Deploy_MaxFeeAllowed() public {
        ClimbEscrow e = new ClimbEscrow(address(usdc), treasury, 500, owner);
        assertEq(e.feeBps(), 500);
    }

    function test_Deploy_RevertsOnZeroAddresses() public {
        vm.expectRevert(ClimbEscrow.ZeroAddress.selector);
        new ClimbEscrow(address(0), treasury, FEE, owner);
        vm.expectRevert(ClimbEscrow.ZeroAddress.selector);
        new ClimbEscrow(address(usdc), address(0), FEE, owner);
        // owner_ == 0 is rejected by OZ Ownable(0) before the body runs
        vm.expectRevert();
        new ClimbEscrow(address(usdc), treasury, FEE, address(0));
    }

    // ---------- create / events ----------

    function test_CreateBounty_PullsFundsAndRecordsState() public {
        uint256 before = usdc.balanceOf(creator);
        vm.expectEmit(true, true, false, true, address(escrow));
        emit ClimbEscrow.BountyCreated(1, creator, "Climb the wall", "general", 10 * U, false);
        uint256 id = _create(false, 10 * U);
        assertEq(id, 1);
        assertEq(escrow.bountyCount(), 1);
        assertEq(usdc.balanceOf(creator), before - 10 * U);
        assertEq(usdc.balanceOf(address(escrow)), 10 * U);
        ClimbEscrow.Bounty memory b = escrow.getBounty(id);
        assertEq(b.creator, creator);
        assertEq(b.totalFunds, 10 * U);
        assertFalse(b.isOpen);
        assertEq(uint8(b.status), uint8(ClimbEscrow.Status.Active));
        assertEq(escrow.getContribution(id, creator), 10 * U);
        assertTrue(escrow.isContributor(id, creator));
    }

    function test_CreateBounty_RevertsBelowMin() public {
        vm.prank(creator);
        vm.expectRevert(ClimbEscrow.AmountTooSmall.selector);
        escrow.createBounty("t", "d", "c", U - 1, false);
    }

    function test_CreateBounty_ExactMinOk() public {
        assertEq(_create(false, U), 1);
    }

    function test_CreateBounty_InvalidTitleAndDescription() public {
        vm.startPrank(creator);
        vm.expectRevert(ClimbEscrow.InvalidTitleLength.selector);
        escrow.createBounty("", "d", "c", U, false);
        vm.expectRevert(ClimbEscrow.InvalidTitleLength.selector);
        escrow.createBounty(string(new bytes(121)), "d", "c", U, false);
        vm.expectRevert(ClimbEscrow.DescriptionTooLong.selector);
        escrow.createBounty("t", string(new bytes(2001)), "c", U, false);
        vm.stopPrank();
    }

    function test_Contribute_HappyPathAndEvent() public {
        uint256 id = _create(true, 10 * U);
        vm.expectEmit(true, true, false, true, address(escrow));
        emit ClimbEscrow.Contributed(id, bob, 2 * U);
        _contribute(bob, id, 2 * U);
        _contribute(bob, id, 1 * U); // top-up keeps a single contributor entry
        assertEq(escrow.getContribution(id, bob), 3 * U);
        assertEq(escrow.getBounty(id).totalFunds, 13 * U);
        assertEq(escrow.getContributors(id).length, 2);
        assertEq(usdc.balanceOf(address(escrow)), 13 * U);
    }

    function test_Contribute_RevertsBelowMin() public {
        uint256 id = _create(true, 10 * U);
        vm.prank(bob);
        vm.expectRevert(ClimbEscrow.AmountTooSmall.selector);
        escrow.contribute(id, 1e5 - 1);
        _contribute(bob, id, 1e5); // exact min ok
    }

    function test_Contribute_RevertsOnSolo() public {
        uint256 id = _create(false, 10 * U);
        vm.prank(bob);
        vm.expectRevert(ClimbEscrow.OpenBountyRequired.selector);
        escrow.contribute(id, U);
    }

    function test_BountyNotFound() public {
        vm.expectRevert(ClimbEscrow.BountyNotFound.selector);
        escrow.getBounty(1);
        vm.prank(bob);
        vm.expectRevert(ClimbEscrow.BountyNotFound.selector);
        escrow.contribute(99, U);
    }

    // ---------- claims ----------

    function test_SubmitClaim_HappyPathAndEvent() public {
        uint256 id = _create(false, 10 * U);
        vm.expectEmit(true, true, true, true, address(escrow));
        emit ClimbEscrow.ClaimSubmitted(id, 0, alice);
        uint256 cid = _claim(alice, id);
        assertEq(cid, 0);
        assertEq(escrow.claimCount(id), 1);
        assertTrue(escrow.hasClaimed(id, alice));
        ClimbEscrow.Claim[] memory page = escrow.getClaims(id, 0, 10);
        assertEq(page.length, 1);
        assertEq(page[0].claimant, alice);
        assertEq(escrow.getClaims(id, 5, 10).length, 0);
    }

    function test_SubmitClaim_CreatorCannotClaimOwn() public {
        uint256 id = _create(false, 10 * U);
        vm.prank(creator);
        vm.expectRevert(ClimbEscrow.CreatorCannotClaim.selector);
        escrow.submitClaim(id, "ipfs://x", "n");
    }

    function test_SubmitClaim_ContributorCannotClaim() public {
        uint256 id = _openBounty();
        vm.prank(bob);
        vm.expectRevert(ClimbEscrow.ContributorCannotClaim.selector);
        escrow.submitClaim(id, "ipfs://x", "n");
    }

    function test_Contribute_ClaimantCannotContribute() public {
        uint256 id = _create(true, 10 * U);
        _claim(alice, id);
        vm.prank(alice);
        vm.expectRevert(ClimbEscrow.ClaimantCannotContribute.selector);
        escrow.contribute(id, U);
    }

    function test_SubmitClaim_InputValidation() public {
        uint256 id = _create(false, 10 * U);
        vm.startPrank(alice);
        vm.expectRevert(ClimbEscrow.InvalidProofURILength.selector);
        escrow.submitClaim(id, "", "n");
        vm.expectRevert(ClimbEscrow.InvalidProofURILength.selector);
        escrow.submitClaim(id, string(new bytes(513)), "n");
        vm.expectRevert(ClimbEscrow.NoteTooLong.selector);
        escrow.submitClaim(id, "ipfs://x", string(new bytes(501)));
        vm.stopPrank();
    }

    // ---------- solo ----------

    function test_Solo_CreateClaimAccept_PaysClaimantMinusFeeAndTreasury() public {
        uint256 id = _create(false, 100 * U);
        uint256 cid = _claim(alice, id);
        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 trBefore = usdc.balanceOf(treasury);

        vm.expectEmit(true, true, true, true, address(escrow));
        emit ClimbEscrow.BountyPaid(id, cid, alice, 97_500_000, 2_500_000);
        vm.prank(creator);
        escrow.acceptClaim(id, cid);

        assertEq(usdc.balanceOf(alice) - aliceBefore, 97_500_000, "claimant gets amount - 2.5%");
        assertEq(usdc.balanceOf(treasury) - trBefore, 2_500_000, "treasury gets 2.5%");
        assertEq(usdc.balanceOf(address(escrow)), 0);
        assertEq(uint8(_status(id)), uint8(ClimbEscrow.Status.Paid));
        assertEq(escrow.getBounty(id).totalFunds, 0);
    }

    function test_Solo_AcceptRevertsForNonCreator() public {
        uint256 id = _create(false, 10 * U);
        uint256 cid = _claim(alice, id);
        vm.prank(stranger);
        vm.expectRevert(ClimbEscrow.NotBountyCreator.selector);
        escrow.acceptClaim(id, cid);
    }

    function test_Solo_AcceptUnknownClaimReverts() public {
        uint256 id = _create(false, 10 * U);
        vm.prank(creator);
        vm.expectRevert(ClimbEscrow.ClaimNotFound.selector);
        escrow.acceptClaim(id, 0);
    }

    function test_Accept_OnPaidReverts() public {
        uint256 id = _create(false, 10 * U);
        uint256 c0 = _claim(alice, id);
        uint256 c1 = _claim(dave, id);
        vm.startPrank(creator);
        escrow.acceptClaim(id, c0);
        vm.expectRevert(ClimbEscrow.InvalidBountyStatus.selector);
        escrow.acceptClaim(id, c1);
        vm.stopPrank();
    }

    function test_Accept_OnCancelledReverts() public {
        uint256 id = _create(false, 10 * U);
        uint256 c0 = _claim(alice, id);
        vm.startPrank(creator);
        escrow.cancelBounty(id);
        vm.expectRevert(ClimbEscrow.InvalidBountyStatus.selector);
        escrow.acceptClaim(id, c0);
        vm.stopPrank();
    }

    function test_Accept_OnOpenBountyReverts() public {
        uint256 id = _create(true, 10 * U);
        uint256 c0 = _claim(alice, id);
        vm.prank(creator);
        vm.expectRevert(ClimbEscrow.SoloBountyRequired.selector);
        escrow.acceptClaim(id, c0);
    }

    function test_Nominate_OnSoloReverts() public {
        uint256 id = _create(false, 10 * U);
        uint256 c0 = _claim(alice, id);
        vm.prank(creator);
        vm.expectRevert(ClimbEscrow.OpenBountyRequired.selector);
        escrow.nominateClaim(id, c0);
    }

    function test_Nominate_OnlyCreatorAndUnknownClaim() public {
        uint256 id = _create(true, 10 * U);
        uint256 c0 = _claim(alice, id);
        vm.prank(bob);
        vm.expectRevert(ClimbEscrow.NotBountyCreator.selector);
        escrow.nominateClaim(id, c0);
        vm.prank(creator);
        vm.expectRevert(ClimbEscrow.ClaimNotFound.selector);
        escrow.nominateClaim(id, 7);
    }

    // ---------- open: passing vote ----------

    function test_Open_MajorityYes_ResolveAfter48h_Pays() public {
        uint256 id = _openBounty(); // creator 10, bob 5, carol 3 => 18
        uint256 cid = _claim(alice, id);

        uint64 t0 = uint64(block.timestamp);
        vm.expectEmit(true, true, true, true, address(escrow));
        emit ClimbEscrow.ClaimNominated(id, cid, creator, 1, t0 + 48 hours);
        _nominate(id, cid);
        assertEq(uint8(_status(id)), uint8(ClimbEscrow.Status.Voting));

        vm.expectEmit(true, true, false, true, address(escrow));
        emit ClimbEscrow.Voted(id, bob, 1, true, 5 * U);
        _vote(bob, id, true);
        _vote(carol, id, false);
        _vote(creator, id, true);
        assertTrue(escrow.hasVoted(id, bob));
        ClimbEscrow.Bounty memory b = escrow.getBounty(id);
        assertEq(b.yesWeight, 15 * U);
        assertEq(b.noWeight, 3 * U);

        skip(48 hours);
        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 trBefore = usdc.balanceOf(treasury);
        vm.expectEmit(true, false, false, true, address(escrow));
        emit ClimbEscrow.VoteResolved(id, true, 15 * U, 3 * U);
        escrow.resolveVote(id); // anyone can resolve

        assertEq(usdc.balanceOf(alice) - aliceBefore, 17_550_000);
        assertEq(usdc.balanceOf(treasury) - trBefore, 450_000);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        assertEq(uint8(_status(id)), uint8(ClimbEscrow.Status.Paid));
    }

    // ---------- open: failing vote, cooldown, renomination ----------

    function test_Open_VoteFails_Cooldown_Renominate_Passes() public {
        uint256 id = _create(true, 4 * U);
        _contribute(bob, id, 5 * U);
        _contribute(carol, id, 3 * U); // total 12
        uint256 c0 = _claim(alice, id);
        uint256 c1 = _claim(dave, id);

        _nominate(id, c0); // first nomination: no cooldown
        _vote(creator, id, false); // 4
        _vote(bob, id, false); // 5
        _vote(carol, id, true); // 3
        skip(48 hours);
        uint256 resolvedAt = block.timestamp;
        escrow.resolveVote(id);

        assertEq(uint8(_status(id)), uint8(ClimbEscrow.Status.Active), "back to Active");
        assertEq(usdc.balanceOf(alice), WALLET);
        assertEq(escrow.nominationAvailableAt(id), resolvedAt + 24 hours);

        vm.prank(creator);
        vm.expectRevert(ClimbEscrow.NominationCooldown.selector);
        escrow.nominateClaim(id, c1);

        skip(24 hours - 1);
        vm.prank(creator);
        vm.expectRevert(ClimbEscrow.NominationCooldown.selector);
        escrow.nominateClaim(id, c1);

        skip(1);
        _nominate(id, c1);
        assertEq(escrow.getBounty(id).voteRound, 2);
        assertFalse(escrow.hasVoted(id, bob), "fresh round");
        _vote(bob, id, true);
        _vote(carol, id, true);
        _vote(creator, id, false);
        skip(48 hours);
        escrow.resolveVote(id);

        assertEq(uint8(_status(id)), uint8(ClimbEscrow.Status.Paid));
        assertEq(usdc.balanceOf(dave), WALLET + 12 * U - _fee(12 * U));
        assertEq(usdc.balanceOf(treasury), _fee(12 * U));
    }

    function test_Open_TieOrNoVotes_Fails() public {
        uint256 id = _openBounty();
        uint256 c0 = _claim(alice, id);
        _nominate(id, c0);
        skip(48 hours);
        escrow.resolveVote(id);
        assertEq(uint8(_status(id)), uint8(ClimbEscrow.Status.Active));
        assertEq(usdc.balanceOf(address(escrow)), 18 * U);
    }

    function test_Open_ContributeAndWithdrawAllowedDuringCooldown() public {
        uint256 id = _openBounty();
        uint256 c0 = _claim(alice, id);
        _nominate(id, c0);
        skip(48 hours);
        escrow.resolveVote(id);
        _contribute(stranger, id, U);
        vm.prank(bob);
        escrow.withdrawContribution(id);
        assertEq(escrow.getBounty(id).totalFunds, 14 * U);
    }

    // ---------- voting reverts ----------

    function _votingBounty() internal returns (uint256 id) {
        id = _openBounty();
        uint256 c0 = _claim(alice, id);
        _nominate(id, c0);
    }

    function test_Voting_ContributeReverts() public {
        uint256 id = _votingBounty();
        vm.prank(bob);
        vm.expectRevert(ClimbEscrow.InvalidBountyStatus.selector);
        escrow.contribute(id, U);
    }

    function test_Voting_WithdrawReverts() public {
        uint256 id = _votingBounty();
        vm.prank(bob);
        vm.expectRevert(ClimbEscrow.InvalidBountyStatus.selector);
        escrow.withdrawContribution(id);
    }

    function test_Voting_CancelReverts() public {
        uint256 id = _votingBounty();
        vm.prank(creator);
        vm.expectRevert(ClimbEscrow.InvalidBountyStatus.selector);
        escrow.cancelBounty(id);
    }

    function test_Voting_DoubleVoteReverts() public {
        uint256 id = _votingBounty();
        _vote(bob, id, true);
        vm.prank(bob);
        vm.expectRevert(ClimbEscrow.AlreadyVoted.selector);
        escrow.vote(id, false);
    }

    function test_Voting_AfterEndReverts() public {
        uint256 id = _votingBounty();
        skip(48 hours); // block.timestamp == voteEndsAt => ended
        vm.prank(bob);
        vm.expectRevert(ClimbEscrow.VotingEnded.selector);
        escrow.vote(id, true);
    }

    function test_Voting_LastSecondVoteOk() public {
        uint256 id = _votingBounty();
        skip(48 hours - 1);
        _vote(bob, id, true);
        assertTrue(escrow.hasVoted(id, bob));
    }

    function test_Voting_NonContributorReverts() public {
        uint256 id = _votingBounty();
        vm.prank(stranger);
        vm.expectRevert(ClimbEscrow.NoContribution.selector);
        escrow.vote(id, true);
    }

    function test_Voting_NotInVotingStatusReverts() public {
        uint256 id = _openBounty();
        vm.prank(bob);
        vm.expectRevert(ClimbEscrow.InvalidBountyStatus.selector);
        escrow.vote(id, true);
    }

    function test_ResolveVote_BeforeEndReverts() public {
        uint256 id = _votingBounty();
        skip(48 hours - 1);
        vm.expectRevert(ClimbEscrow.VotingNotEnded.selector);
        escrow.resolveVote(id);
    }

    function test_ResolveVote_NotVotingReverts() public {
        uint256 id = _openBounty();
        vm.expectRevert(ClimbEscrow.InvalidBountyStatus.selector);
        escrow.resolveVote(id);
    }

    function test_Nominate_OnPaidReverts() public {
        uint256 id = _votingBounty();
        _vote(creator, id, true);
        skip(48 hours);
        escrow.resolveVote(id);
        vm.prank(creator);
        vm.expectRevert(ClimbEscrow.InvalidBountyStatus.selector);
        escrow.nominateClaim(id, 0);
    }
}
