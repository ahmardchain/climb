// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ClimbEscrowTestBase} from "./ClimbEscrow.Base.t.sol";
import {ClimbEscrowHandler} from "./ClimbEscrow.Handler.t.sol";

contract ClimbEscrowInvariantTest is ClimbEscrowTestBase {
    ClimbEscrowHandler internal handler;

    function setUp() public override {
        super.setUp();
        handler = new ClimbEscrowHandler(escrow, usdc);
        targetContract(address(handler));
    }

    /// Escrow token balance == sum of live totalFunds (no deferred payouts occur with this token).
    function invariant_EscrowBalanceEqualsSumOfTotalFunds() public view {
        assertEq(usdc.balanceOf(address(escrow)), handler.sumTotalFunds());
    }

    function invariant_TotalFundsEqualsSumOfContributions() public view {
        assertTrue(handler.contributionsMatchTotals());
    }
}
