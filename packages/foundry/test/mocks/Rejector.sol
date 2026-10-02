// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { PredictionMarkets } from "../../contracts/PredictionMarkets.sol";

/// @notice Caller without a receive() so HBAR refunds and payouts to it fail.
contract Rejector {
    PredictionMarkets public pm;

    constructor(PredictionMarkets pm_) {
        pm = pm_;
    }

    function stakeYes(uint256 marketId) external payable {
        // forge-lint: disable-next-line(arbitrary-send-eth)
        pm.stake{ value: msg.value }(marketId, true);
    }

    function settlePyth(uint256 marketId, bytes[] calldata updateData) external payable {
        // forge-lint: disable-next-line(arbitrary-send-eth)
        pm.settleWithPyth{ value: msg.value }(marketId, updateData);
    }

    function redeemTokens(uint256 marketId, bool yes, uint256 amount) external {
        pm.redeem(marketId, yes, amount);
    }
}
