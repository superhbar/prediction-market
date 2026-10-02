// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { PriceMath } from "../contracts/libraries/PriceMath.sol";

/// @notice External wrapper exposing the internal PriceMath functions for direct unit tests.
contract PriceMathHarness {
    function chainlink(int256 answer, uint8 feedDecimals) external pure returns (int256) {
        return PriceMath.normalizeChainlink(answer, feedDecimals);
    }

    function pyth(int64 price, int32 expo) external pure returns (int256) {
        return PriceMath.normalizePyth(price, expo);
    }
}

/// @notice Direct unit tests for every PriceMath normalization branch.
contract PriceMathTest is Test {
    PriceMathHarness internal math;

    function setUp() public {
        math = new PriceMathHarness();
    }

    function test_ChainlinkEightDecimals() public view {
        assertEq(math.chainlink(35_000_000, 8), 3.5e17);
    }

    function test_ChainlinkEighteenDecimalsPassthrough() public view {
        assertEq(math.chainlink(3.5e17, 18), 3.5e17);
    }

    function test_ChainlinkFewerDecimals() public view {
        assertEq(math.chainlink(1_000_000, 6), 1e18);
    }

    function test_ChainlinkMoreDecimals() public view {
        assertEq(math.chainlink(5 * int256(10 ** 20), 20), 5e18);
    }

    function test_ChainlinkRevertsNonPositive() public {
        vm.expectRevert(PriceMath.InvalidPrice.selector);
        math.chainlink(0, 8);
        vm.expectRevert(PriceMath.InvalidPrice.selector);
        math.chainlink(-1, 8);
    }

    function test_PythNegativeExpo() public view {
        assertEq(math.pyth(35_000_000, -8), 3.5e17);
    }

    function test_PythExpoBelowMinusEighteenDivides() public view {
        assertEq(math.pyth(1_000_000, -20), 10_000);
    }

    function test_PythPositiveExpo() public view {
        assertEq(math.pyth(5, 2), 5e20);
    }

    function test_PythRevertsNonPositive() public {
        vm.expectRevert(PriceMath.InvalidPrice.selector);
        math.pyth(0, -8);
        vm.expectRevert(PriceMath.InvalidPrice.selector);
        math.pyth(-7, -8);
    }
}
