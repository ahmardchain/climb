// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {VmSafe} from "forge-std/Vm.sol";
import {ClimbEscrowTestBase} from "./ClimbEscrow.Base.t.sol";
import {ClimbEscrow} from "../ClimbEscrow.sol";

contract ClimbEscrowCommentsTest is ClimbEscrowTestBase {
    // ---------------- helpers ----------------

    function _str(uint256 n) internal pure returns (string memory) {
        bytes memory b = new bytes(n);
        for (uint256 i; i < n; ++i) b[i] = "a";
        return string(b);
    }

    function _createWithCategory(string memory category, bool isOpen) internal returns (uint256 id) {
        vm.prank(creator);
        id = escrow.createBounty("Title", "desc", category, 5 * U, isOpen);
    }

    /// @dev Returns a bounty id in the requested status.
    function _bountyInStatus(ClimbEscrow.Status s) internal returns (uint256 id) {
        if (s == ClimbEscrow.Status.Active) {
            id = _create(false, 5 * U);
        } else if (s == ClimbEscrow.Status.Voting) {
            id = _create(true, 5 * U);
            uint256 c = _claim(alice, id);
            _nominate(id, c);
        } else if (s == ClimbEscrow.Status.Paid) {
            id = _create(false, 5 * U);
            uint256 c = _claim(alice, id);
            vm.prank(creator);
            escrow.acceptClaim(id, c);
        } else {
            id = _create(false, 5 * U);
            vm.prank(creator);
            escrow.cancelBounty(id);
        }
        assertEq(uint8(_status(id)), uint8(s));
    }

    function _expectComment(uint256 id, address author, string memory text) internal {
        vm.expectEmit(true, true, false, true, address(escrow));
        emit ClimbEscrow.CommentAdded(id, author, text, block.timestamp);
    }

    // ---------------- category on createBounty ----------------

    function test_Category_StoredAndReturnedByGetBounty() public {
        uint256 id = _createWithCategory("fitness", true);
        assertEq(escrow.getBounty(id).category, "fitness");
    }

    function test_Category_EmittedInBountyCreated() public {
        vm.expectEmit(true, true, false, true, address(escrow));
        emit ClimbEscrow.BountyCreated(1, creator, "Title", "fitness", 5 * U, true);
        _createWithCategory("fitness", true);
    }

    function test_Category_32BytesOk() public {
        string memory cat = _str(32);
        vm.expectEmit(true, true, false, true, address(escrow));
        emit ClimbEscrow.BountyCreated(1, creator, "Title", cat, 5 * U, false);
        uint256 id = _createWithCategory(cat, false);
        assertEq(escrow.getBounty(id).category, cat);
    }

    function test_Category_33BytesReverts() public {
        vm.prank(creator);
        vm.expectRevert(ClimbEscrow.CategoryTooLong.selector);
        escrow.createBounty("Title", "desc", _str(33), 5 * U, false);
    }

    function test_Category_EmptyOk() public {
        vm.expectEmit(true, true, false, true, address(escrow));
        emit ClimbEscrow.BountyCreated(1, creator, "Title", "", 5 * U, false);
        uint256 id = _createWithCategory("", false);
        assertEq(bytes(escrow.getBounty(id).category).length, 0);
        assertEq(usdc.balanceOf(address(escrow)), 5 * U);
    }

    function test_Category_PersistsThroughLifecycle() public {
        uint256 id = _createWithCategory("fitness", false);
        uint256 c = _claim(alice, id);
        vm.prank(creator);
        escrow.acceptClaim(id, c);
        assertEq(escrow.getBounty(id).category, "fitness");
    }

    function test_Category_TooLongDoesNotMoveFundsOrCreate() public {
        uint256 before = usdc.balanceOf(creator);
        vm.prank(creator);
        vm.expectRevert(ClimbEscrow.CategoryTooLong.selector);
        escrow.createBounty("Title", "desc", _str(33), 5 * U, true);
        assertEq(usdc.balanceOf(creator), before);
        assertEq(escrow.bountyCount(), 0);
    }

    // ---------------- addComment: events ----------------

    function test_AddComment_EmitsForCreator() public {
        uint256 id = _create(false, 5 * U);
        vm.warp(1_700_000_000);
        _expectComment(id, creator, "hello");
        vm.prank(creator);
        escrow.addComment(id, "hello");
    }

    function test_AddComment_EmitsForFunder() public {
        uint256 id = _create(true, 5 * U);
        _contribute(bob, id, 2 * U);
        vm.warp(1_700_000_123);
        _expectComment(id, bob, "nice one");
        vm.prank(bob);
        escrow.addComment(id, "nice one");
    }

    function test_AddComment_EmitsForStranger() public {
        uint256 id = _create(false, 5 * U);
        vm.warp(1_800_000_000);
        _expectComment(id, stranger, "go go go");
        vm.prank(stranger);
        escrow.addComment(id, "go go go");
    }

    function test_AddComment_EmitsInEveryStatus() public {
        ClimbEscrow.Status[4] memory all = [
            ClimbEscrow.Status.Active,
            ClimbEscrow.Status.Voting,
            ClimbEscrow.Status.Paid,
            ClimbEscrow.Status.Cancelled
        ];
        address[3] memory authors = [creator, bob, stranger];
        for (uint256 i; i < all.length; ++i) {
            uint256 id = _bountyInStatus(all[i]);
            for (uint256 j; j < authors.length; ++j) {
                vm.warp(block.timestamp + 17);
                _expectComment(id, authors[j], "status comment");
                vm.prank(authors[j]);
                escrow.addComment(id, "status comment");
            }
        }
    }

    function test_AddComment_TimestampIsBlockTimestamp() public {
        uint256 id = _create(false, 5 * U);
        vm.warp(1_234_567_890);
        vm.recordLogs();
        vm.prank(stranger);
        escrow.addComment(id, "ts");
        VmSafe.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 1);
        assertEq(logs[0].topics[0], ClimbEscrow.CommentAdded.selector);
        assertEq(uint256(logs[0].topics[1]), id);
        assertEq(address(uint160(uint256(logs[0].topics[2]))), stranger);
        (string memory text, uint256 ts) = abi.decode(logs[0].data, (string, uint256));
        assertEq(text, "ts");
        assertEq(ts, 1_234_567_890);
    }

    function test_AddComment_MultipleCommentsAllowed() public {
        uint256 id = _create(false, 5 * U);
        _expectComment(id, stranger, "one");
        vm.prank(stranger);
        escrow.addComment(id, "one");
        _expectComment(id, stranger, "two");
        vm.prank(stranger);
        escrow.addComment(id, "two");
    }

    // ---------------- addComment: length bounds ----------------

    function test_AddComment_1ByteOk() public {
        uint256 id = _create(false, 5 * U);
        _expectComment(id, stranger, "x");
        vm.prank(stranger);
        escrow.addComment(id, "x");
    }

    function test_AddComment_500BytesOk() public {
        uint256 id = _create(false, 5 * U);
        string memory t = _str(500);
        _expectComment(id, stranger, t);
        vm.prank(stranger);
        escrow.addComment(id, t);
    }

    function test_AddComment_501BytesReverts() public {
        uint256 id = _create(false, 5 * U);
        vm.prank(stranger);
        vm.expectRevert(ClimbEscrow.CommentTooLong.selector);
        escrow.addComment(id, _str(501));
    }

    function test_AddComment_EmptyReverts() public {
        uint256 id = _create(false, 5 * U);
        vm.prank(stranger);
        vm.expectRevert(ClimbEscrow.CommentEmpty.selector);
        escrow.addComment(id, "");
    }

    function test_AddComment_UnknownBountyReverts() public {
        vm.prank(stranger);
        vm.expectRevert(ClimbEscrow.BountyNotFound.selector);
        escrow.addComment(1, "hi");
        uint256 id = _create(false, 5 * U);
        vm.prank(stranger);
        vm.expectRevert(ClimbEscrow.BountyNotFound.selector);
        escrow.addComment(id + 1, "hi");
        vm.prank(stranger);
        vm.expectRevert(ClimbEscrow.BountyNotFound.selector);
        escrow.addComment(0, "hi");
    }

    function test_AddComment_UnknownBountyCheckedBeforeText() public {
        // BountyNotFound takes precedence over text validation
        vm.prank(stranger);
        vm.expectRevert(ClimbEscrow.BountyNotFound.selector);
        escrow.addComment(99, "");
    }

    // ---------------- addComment: no side effects ----------------

    function test_AddComment_MovesNoFundsAndChangesNoState() public {
        uint256 id = _openBountyWithClaim();
        ClimbEscrow.Bounty memory beforeB = escrow.getBounty(id);
        uint256 escrowBal = usdc.balanceOf(address(escrow));
        uint256 strangerBal = usdc.balanceOf(stranger);
        uint256 creatorBal = usdc.balanceOf(creator);
        uint256 contrib = escrow.getContribution(id, bob);
        uint256 claims = escrow.claimCount(id);
        uint256 count = escrow.bountyCount();

        vm.prank(stranger);
        escrow.addComment(id, "no side effects");
        vm.prank(bob);
        escrow.addComment(id, "no side effects");
        vm.prank(creator);
        escrow.addComment(id, "no side effects");

        assertEq(usdc.balanceOf(address(escrow)), escrowBal);
        assertEq(usdc.balanceOf(stranger), strangerBal);
        assertEq(usdc.balanceOf(creator), creatorBal);
        assertEq(escrow.getContribution(id, bob), contrib);
        assertEq(escrow.claimCount(id), claims);
        assertEq(escrow.bountyCount(), count);
        assertEq(escrow.pendingPayouts(stranger), 0);
        assertEq(abi.encode(escrow.getBounty(id)), abi.encode(beforeB));
    }

    function test_AddComment_NoStateChangeInEveryStatus() public {
        ClimbEscrow.Status[4] memory all = [
            ClimbEscrow.Status.Active,
            ClimbEscrow.Status.Voting,
            ClimbEscrow.Status.Paid,
            ClimbEscrow.Status.Cancelled
        ];
        for (uint256 i; i < all.length; ++i) {
            uint256 id = _bountyInStatus(all[i]);
            bytes memory b0 = abi.encode(escrow.getBounty(id));
            uint256 bal0 = usdc.balanceOf(address(escrow));
            vm.prank(stranger);
            escrow.addComment(id, "c");
            assertEq(usdc.balanceOf(address(escrow)), bal0);
            assertEq(abi.encode(escrow.getBounty(id)), b0);
        }
    }

    function test_AddComment_NotPayable() public {
        uint256 id = _create(false, 5 * U);
        vm.deal(stranger, 1 ether);
        vm.prank(stranger);
        (bool ok,) = address(escrow).call{value: 1 wei}(abi.encodeCall(escrow.addComment, (id, "eth")));
        assertFalse(ok);
        assertEq(address(escrow).balance, 0);
    }

    function _openBountyWithClaim() internal returns (uint256 id) {
        id = _openBounty();
        _claim(alice, id);
    }

    // ---------------- fuzz ----------------

    function testFuzz_AddComment_NeverChangesEscrowBalance(address caller, uint256 len, uint8 statusSel, bytes32 seed)
        public
    {
        vm.assume(caller != address(0) && caller != address(escrow));
        len = bound(len, 1, 500);
        ClimbEscrow.Status s = ClimbEscrow.Status(bound(statusSel, 0, 3));
        uint256 id = _bountyInStatus(s);

        bytes memory t = new bytes(len);
        for (uint256 i; i < len; ++i) t[i] = bytes1(uint8(uint256(keccak256(abi.encode(seed, i)))));
        string memory text = string(t);

        uint256 escrowBal = usdc.balanceOf(address(escrow));
        uint256 callerBal = usdc.balanceOf(caller);
        bytes memory b0 = abi.encode(escrow.getBounty(id));

        _expectComment(id, caller, text);
        vm.prank(caller);
        escrow.addComment(id, text);

        assertEq(usdc.balanceOf(address(escrow)), escrowBal, "escrow balance unchanged");
        assertEq(usdc.balanceOf(caller), callerBal, "caller balance unchanged");
        assertEq(abi.encode(escrow.getBounty(id)), b0, "bounty unchanged");
    }

    function testFuzz_AddComment_TooLongAlwaysReverts(uint256 len) public {
        len = bound(len, 501, 2000);
        uint256 id = _create(false, 5 * U);
        vm.prank(stranger);
        vm.expectRevert(ClimbEscrow.CommentTooLong.selector);
        escrow.addComment(id, _str(len));
    }

    function testFuzz_Category_BoundaryRule(uint256 len) public {
        len = bound(len, 0, 100);
        vm.prank(creator);
        if (len > 32) vm.expectRevert(ClimbEscrow.CategoryTooLong.selector);
        uint256 id = escrow.createBounty("Title", "desc", _str(len), 5 * U, false);
        if (len <= 32) assertEq(bytes(escrow.getBounty(id).category).length, len);
    }
}
