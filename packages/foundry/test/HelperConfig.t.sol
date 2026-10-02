// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { Config, Feed } from "../contracts/PredictionMarkets.sol";
import { HelperConfig } from "../script/HelperConfig.s.sol";

/// @notice Concrete HelperConfig so the abstract base can be exercised directly.
contract HelperConfigHarness is HelperConfig { }

/// @notice Unit tests for the deploy HelperConfig on both Hedera chains.
contract HelperConfigTest is Test {
    HelperConfig internal helper;

    bytes32 internal constant HBAR_KEY = "HBAR/USD";

    function setUp() public {
        helper = new HelperConfigHarness();
    }

    function test_GetConfig_Testnet() public {
        vm.chainId(296);
        (bytes32[] memory keys, Feed[] memory feeds, address pyth, Config memory cfg) = helper.getConfig();
        assertEq(keys.length, 3);
        assertEq(keys[0], HBAR_KEY);
        assertEq(feeds[0].chainlink, 0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a);
        assertEq(pyth, 0xA2aa501b19aff244D90cc15a4Cf739D2725B5729);
        assertEq(cfg.settlementDelay, 10 minutes);
        assertEq(cfg.retryDelay, 15 minutes);
        assertEq(cfg.maxRetries, 3);
        assertEq(cfg.maxRoundLag, 2 hours);
        assertEq(cfg.gracePeriod, 24 hours);
        assertEq(cfg.minDuration, 5 minutes);
        assertEq(cfg.maxDuration, 60 days);
        assertEq(cfg.minReserve, 7e8);
        assertEq(cfg.retryCostEstimate, 1.5e8);
    }

    function test_GetConfig_Mainnet() public {
        vm.chainId(295);
        (bytes32[] memory keys, Feed[] memory feeds, address pyth, Config memory cfg) = helper.getConfig();
        assertEq(keys.length, 3);
        assertEq(feeds[0].chainlink, 0xAF685FB45C12b92b5054ccb9313e135525F9b5d5);
        assertEq(feeds[1].chainlink, 0xaD01E27668658Cc8c1Ce6Ed31503D75F31eEf480);
        assertEq(feeds[2].chainlink, 0xd2D2CB0AEb29472C3008E291355757AD6225019e);
        assertEq(pyth, 0xA2aa501b19aff244D90cc15a4Cf739D2725B5729);
        assertEq(cfg.minReserve, 7e8);
    }

    function test_GetConfig_RevertsUnknownChain() public {
        vm.chainId(31337);
        vm.expectRevert(abi.encodeWithSelector(HelperConfig.InvalidChainId.selector, 31337));
        // forge-lint: disable-next-line(unused-return)
        helper.getConfig();
    }
}
