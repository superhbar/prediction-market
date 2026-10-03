// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { Config, Feed, Outcome, PredictionMarkets, PriceSource, State } from "../contracts/PredictionMarkets.sol";
import { MockHTS } from "./mocks/MockHTS.sol";
import { MockHSS } from "./mocks/MockHSS.sol";
import { MockAggregator } from "./mocks/MockAggregator.sol";
import { MockPyth } from "./mocks/MockPyth.sol";
import { Rejector } from "./mocks/Rejector.sol";

/// @notice Unit tests for PredictionMarkets with etched HTS/HSS precompile mocks. No fork, no ffi.
contract PredictionMarketsTest is Test {
    MockHTS internal hts;
    MockHSS internal hss;
    MockAggregator internal hbarFeed;
    MockAggregator internal btcFeed;
    MockAggregator internal ethFeed;
    MockPyth internal pyth;
    PredictionMarkets internal pm;

    address internal constant CREATOR = address(0xC4EA704);
    address internal constant ALICE = address(0xA11CE);
    address internal constant BOB = address(0xB0B);
    address internal constant CAROL = address(0xCA201);

    uint64 internal constant T0 = 1_000_000;
    uint256 internal constant FEE = 1e8;
    uint256 internal constant MIN_RESERVE = 4e8;
    uint256 internal constant RETRY_COST = 1.5e8;
    int256 internal constant STRIKE = 3e17;
    bytes32 internal constant HBAR = "HBAR/USD";
    bytes32 internal constant BTC = "BTC/USD";
    bytes32 internal constant ETH = "ETH/USD";
    bytes32 internal constant DOGE = "DOGE/USD";
    bytes32 internal constant PYTH_HBAR_ID = 0x3728e591097635310e6341af53db8b7ee42da9b3a8d918f9463ce9cca886dfbd;

    uint64 internal expiry;
    uint256 internal creationValue = 2 * FEE + MIN_RESERVE + 1e8;

    receive() external payable { }

    function setUp() public {
        // forge-lint: disable-next-line(unsafe-typecast)
        vm.etch(address(0x167), address(new MockHTS()).code);
        // forge-lint: disable-next-line(unsafe-typecast)
        vm.etch(address(0x16b), address(new MockHSS()).code);
        // forge-lint: disable-next-line(unsafe-typecast)
        hts = MockHTS(payable(address(0x167)));
        // forge-lint: disable-next-line(unsafe-typecast)
        hss = MockHSS(address(0x16b));
        hts.setCreationFee(FEE);
        // Etched code starts with zeroed storage, so restore the mock defaults the constructor set.
        hss.setCapacity(true);
        hss.setResponseCode(22);

        hbarFeed = new MockAggregator();
        btcFeed = new MockAggregator();
        ethFeed = new MockAggregator();
        pyth = new MockPyth();

        bytes32[] memory keys = new bytes32[](3);
        keys[0] = HBAR;
        keys[1] = BTC;
        keys[2] = ETH;
        Feed[] memory feedsList = new Feed[](3);
        feedsList[0] = Feed({ chainlink: address(hbarFeed), pythId: PYTH_HBAR_ID });
        feedsList[1] = Feed({ chainlink: address(btcFeed), pythId: bytes32(uint256(2)) });
        feedsList[2] = Feed({ chainlink: address(ethFeed), pythId: bytes32(uint256(3)) });
        Config memory cfg = Config({
            settlementDelay: 5 minutes,
            retryDelay: 10 minutes,
            maxRetries: 2,
            maxRoundLag: 2 hours,
            gracePeriod: 24 hours,
            minDuration: 5 minutes,
            maxDuration: 60 days,
            minReserve: MIN_RESERVE,
            retryCostEstimate: RETRY_COST
        });
        pm = new PredictionMarkets(keys, feedsList, address(pyth), cfg);

        vm.warp(T0);
        expiry = T0 + 3600;
        vm.deal(CREATOR, 1000e8);
        vm.deal(ALICE, 1000e8);
        vm.deal(BOB, 1000e8);
        vm.deal(CAROL, 1000e8);
    }

    // Helpers route every value-bearing call through one lint-acknowledged site each.

    function _createAs(address user, bytes32 key, int256 strike, uint64 exp, uint256 value)
        internal
        returns (uint256 marketId)
    {
        vm.prank(user);
        // forge-lint: disable-next-line(arbitrary-send-eth)
        return pm.createMarket{ value: value }(key, strike, exp);
    }

    function _stakeAs(address user, uint256 marketId, bool yes, uint256 amount) internal {
        vm.prank(user);
        // forge-lint: disable-next-line(arbitrary-send-eth)
        pm.stake{ value: amount }(marketId, yes);
    }

    function _settlePythAs(address user, uint256 marketId, bytes[] memory updateData, uint256 value) internal {
        vm.prank(user);
        // forge-lint: disable-next-line(arbitrary-send-eth)
        pm.settleWithPyth{ value: value }(marketId, updateData);
    }

    function _createMarket() internal returns (uint256 marketId) {
        return _createAs(CREATOR, HBAR, STRIKE, expiry, creationValue);
    }

    function _stakeBothSides(uint256 marketId) internal {
        _stakeAs(ALICE, marketId, true, 6e8);
        _stakeAs(BOB, marketId, false, 4e8);
    }

    // Creation

    function test_CreateMarket_SetsStateBooksScheduleAndReserve() public {
        vm.expectEmit(true, false, false, false);
        // forge-lint: disable-next-line(reentrancy-events)
        emit PredictionMarkets.MarketCreated(0, bytes32(0), 0, 0, address(0), address(0), address(0), address(0), 0);
        uint256 marketId = _createAs(CREATOR, HBAR, STRIKE, expiry, creationValue);
        assertEq(marketId, 0);

        PredictionMarkets.Market memory m = pm.getMarket(0);
        assertEq(m.feedKey, HBAR);
        assertEq(m.strike, STRIKE);
        assertEq(m.expiry, expiry);
        assertEq(m.creator, CREATOR);
        assertTrue(m.yesToken != address(0) && m.noToken != address(0) && m.yesToken != m.noToken);
        assertEq(uint256(m.state), uint256(State.Open));
        assertEq(uint256(m.outcome), uint256(Outcome.Unresolved));
        assertEq(m.retriesLeft, 2);
        assertEq(m.reserve, creationValue - 2 * FEE);

        assertEq(hss.callCount(), 1);
        (address to, uint256 at, uint256 gasLimit) = hss.callArgs(0);
        assertEq(to, address(pm));
        assertEq(at, uint256(expiry) + 5 minutes);
        assertEq(gasLimit, pm.SETTLE_GAS());
        assertEq(m.schedule, hss.lastSchedule());
        assertEq(pm.marketCount(), 1);
    }

    function test_CreateMarket_RevertsUnknownFeed() public {
        vm.expectRevert(abi.encodeWithSelector(PredictionMarkets.FeedNotFound.selector, DOGE));
        _createAs(CREATOR, DOGE, STRIKE, expiry, creationValue);
    }

    function test_CreateMarket_RevertsBadStrike() public {
        vm.expectRevert(PredictionMarkets.InvalidStrike.selector);
        _createAs(CREATOR, HBAR, 0, expiry, creationValue);
        vm.expectRevert(PredictionMarkets.InvalidStrike.selector);
        _createAs(CREATOR, HBAR, -1, expiry, creationValue);
    }

    function test_CreateMarket_RevertsBadExpiry() public {
        vm.expectRevert(PredictionMarkets.InvalidExpiry.selector);
        _createAs(CREATOR, HBAR, STRIKE, T0 + 5 minutes - 1, creationValue);
        vm.expectRevert(PredictionMarkets.InvalidExpiry.selector);
        _createAs(CREATOR, HBAR, STRIKE, T0 + 60 days + 1, creationValue);
    }

    function test_CreateMarket_RevertsLowReserve() public {
        uint256 lowValue = 2 * FEE + MIN_RESERVE - 1;
        vm.expectRevert(
            abi.encodeWithSelector(PredictionMarkets.InsufficientReserve.selector, MIN_RESERVE - 1, MIN_RESERVE)
        );
        _createAs(CREATOR, HBAR, STRIKE, expiry, lowValue);
    }

    function test_CreateMarket_RevertsNoCapacity() public {
        hss.setCapacity(false);
        vm.expectRevert(PredictionMarkets.NoScheduleCapacity.selector);
        _createAs(CREATOR, HBAR, STRIKE, expiry, creationValue);
    }

    function test_CreateMarket_RevertsScheduleFailure() public {
        hss.setResponseCode(33);
        // forge-lint: disable-next-line(unsafe-typecast)
        vm.expectRevert(abi.encodeWithSelector(PredictionMarkets.ScheduleFailed.selector, int64(33)));
        _createAs(CREATOR, HBAR, STRIKE, expiry, creationValue);
    }

    function test_CreateMarket_RevertsTokenCreateFailure() public {
        hts.setCreationFee(creationValue + 1);
        // forge-lint: disable-next-line(unsafe-typecast)
        vm.expectRevert(abi.encodeWithSelector(PredictionMarkets.TokenCreateFailed.selector, int64(200)));
        _createAs(CREATOR, HBAR, STRIKE, expiry, creationValue);
    }

    // Staking

    function test_Stake_MintsTokensAndGrowsPools() public {
        uint256 marketId = _createMarket();
        PredictionMarkets.Market memory m = pm.getMarket(marketId);

        vm.expectEmit(true, false, false, true);
        // forge-lint: disable-next-line(reentrancy-events)
        emit PredictionMarkets.Staked(marketId, ALICE, true, 6e8);
        _stakeAs(ALICE, marketId, true, 6e8);
        _stakeAs(BOB, marketId, false, 4e8);

        assertEq(hts.balanceOf(m.yesToken, ALICE), 6e8);
        assertEq(hts.balanceOf(m.noToken, BOB), 4e8);
        m = pm.getMarket(marketId);
        assertEq(m.yesPool, 6e8);
        assertEq(m.noPool, 4e8);
    }

    function test_Stake_RevertsUnknownMarket() public {
        vm.expectRevert(PredictionMarkets.InvalidMarketId.selector);
        _stakeAs(ALICE, 999, true, 1e8);
    }

    function test_Stake_RevertsAfterExpiry() public {
        uint256 marketId = _createMarket();
        vm.warp(expiry);
        vm.expectRevert(PredictionMarkets.TradingClosed.selector);
        _stakeAs(ALICE, marketId, true, 1e8);
    }

    function test_Stake_RevertsWhenNotOpen() public {
        uint256 marketId = _createMarket();
        _stakeAs(ALICE, marketId, true, 1e8);
        vm.warp(expiry);
        pm.settle(marketId);
        vm.expectRevert(PredictionMarkets.MarketNotOpen.selector);
        _stakeAs(BOB, marketId, true, 1e8);
    }

    function test_Stake_RevertsZeroValue() public {
        uint256 marketId = _createMarket();
        vm.expectRevert(PredictionMarkets.ZeroStake.selector);
        _stakeAs(ALICE, marketId, true, 0);
    }

    function test_Stake_RevertsTooLarge() public {
        uint256 marketId = _createMarket();
        uint256 huge = 2 ** 63;
        vm.deal(ALICE, huge);
        vm.expectRevert(PredictionMarkets.StakeTooLarge.selector);
        _stakeAs(ALICE, marketId, true, huge);
    }

    function test_Stake_RevertsWhenRecipientNotAssociated() public {
        uint256 marketId = _createMarket();
        PredictionMarkets.Market memory m = pm.getMarket(marketId);
        hts.setBlocked(m.yesToken, ALICE, true);
        // forge-lint: disable-next-line(unsafe-typecast)
        vm.expectRevert(abi.encodeWithSelector(PredictionMarkets.TokenTransferFailed.selector, int64(200)));
        _stakeAs(ALICE, marketId, true, 1e8);
    }

    // Chainlink settlement

    function _addSettlementRounds() internal {
        hbarFeed.addRound(20_000_000, expiry - 100);
        hbarFeed.addRound(35_000_000, expiry + 50);
        hbarFeed.addRound(40_000_000, expiry + 200);
    }

    function test_Settle_OneSidedMarketFinalizesInvalidWithoutOracle() public {
        uint256 marketId = _createMarket();
        _stakeAs(ALICE, marketId, true, 6e8);
        vm.warp(expiry);
        vm.expectEmit(true, false, false, true);
        // forge-lint: disable-next-line(reentrancy-events)
        emit PredictionMarkets.MarketSettled(marketId, Outcome.Invalid, 0, 0, PriceSource.None);
        pm.settle(marketId);
        PredictionMarkets.Market memory m = pm.getMarket(marketId);
        assertEq(uint256(m.state), uint256(State.Settled));
        assertEq(uint256(m.outcome), uint256(Outcome.Invalid));
    }

    function test_Settle_PicksFirstRoundAtOrAfterExpiry() public {
        uint256 marketId = _createMarket();
        _stakeBothSides(marketId);
        _addSettlementRounds();
        vm.warp(expiry + 1000);
        vm.expectEmit(true, false, false, true);
        // forge-lint: disable-next-line(reentrancy-events)
        emit PredictionMarkets.MarketSettled(marketId, Outcome.Yes, 3.5e17, expiry + 50, PriceSource.Chainlink);
        pm.settle(marketId);
        PredictionMarkets.Market memory m = pm.getMarket(marketId);
        assertEq(uint256(m.outcome), uint256(Outcome.Yes));
        assertEq(m.settlementPrice, 3.5e17);
        assertEq(m.settlementTime, expiry + 50);
        assertEq(uint256(m.source), uint256(PriceSource.Chainlink));
    }

    function test_Settle_OutcomeNoWhenBelowStrike() public {
        uint256 marketId = _createMarket();
        _stakeBothSides(marketId);
        hbarFeed.addRound(20_000_000, expiry - 100);
        hbarFeed.addRound(25_000_000, expiry + 50);
        vm.warp(expiry + 1000);
        pm.settle(marketId);
        assertEq(uint256(pm.getMarket(marketId).outcome), uint256(Outcome.No));
    }

    function test_Settle_RevertsWhenLatestBeforeExpiry() public {
        uint256 marketId = _createMarket();
        _stakeBothSides(marketId);
        hbarFeed.addRound(35_000_000, expiry - 10);
        vm.warp(expiry + 5);
        vm.expectRevert(PredictionMarkets.NoEligibleRound.selector);
        pm.settle(marketId);
    }

    function test_Settle_ScheduledCallBooksRetryWhenNoRoundYet() public {
        uint256 marketId = _createMarket();
        _stakeBothSides(marketId);
        uint256 reserveBefore = pm.getMarket(marketId).reserve;
        vm.warp(expiry + 5);
        vm.expectEmit(true, false, false, false);
        // forge-lint: disable-next-line(reentrancy-events)
        emit PredictionMarkets.SettlementRetryScheduled(marketId, address(0), 0, 0);
        vm.prank(address(pm));
        pm.settle(marketId);
        PredictionMarkets.Market memory m = pm.getMarket(marketId);
        assertEq(uint256(m.state), uint256(State.Open));
        assertEq(m.retriesLeft, 1);
        assertEq(m.reserve, reserveBefore - pm.SCHEDULED_EXECUTION_COST() - RETRY_COST);
        assertTrue(m.schedulePending);
        assertEq(hss.callCount(), 2);
        (address to, uint256 at, uint256 gasLimit) = hss.callArgs(1);
        assertEq(to, address(pm));
        assertEq(at, block.timestamp + 10 minutes);
        assertEq(gasLimit, pm.SETTLE_GAS());
        assertEq(m.schedule, hss.lastSchedule());
    }

    function test_Settle_ScheduledExecutionChargesReserve() public {
        uint256 marketId = _createMarket();
        _stakeBothSides(marketId);
        hbarFeed.addRound(20_000_000, expiry - 100);
        hbarFeed.addRound(35_000_000, expiry + 50);
        uint256 reserveBefore = pm.getMarket(marketId).reserve;
        vm.warp(expiry + 60);
        vm.prank(address(pm));
        pm.settle(marketId);
        PredictionMarkets.Market memory m = pm.getMarket(marketId);
        assertEq(uint256(m.state), uint256(State.Settled));
        assertEq(m.reserve, reserveBefore - pm.SCHEDULED_EXECUTION_COST());
        assertFalse(m.schedulePending);
    }

    function test_Settle_ManualCallLeavesReserveUntouched() public {
        uint256 marketId = _createMarket();
        _stakeBothSides(marketId);
        hbarFeed.addRound(20_000_000, expiry - 100);
        hbarFeed.addRound(35_000_000, expiry + 50);
        uint256 reserveBefore = pm.getMarket(marketId).reserve;
        vm.warp(expiry + 60);
        vm.prank(CAROL);
        pm.settle(marketId);
        assertEq(pm.getMarket(marketId).reserve, reserveBefore);
        assertTrue(pm.getMarket(marketId).schedulePending);
    }

    function test_Settle_ScheduledCallAfterManualSettleReturnsAndCharges() public {
        uint256 marketId = _settledYesMarket();
        PredictionMarkets.Market memory before = pm.getMarket(marketId);
        assertTrue(before.schedulePending);
        // The booked schedule still fires after a manual settle: it must not revert (a revert is still billed)
        // and it pays for itself from the reserve.
        vm.prank(address(pm));
        pm.settle(marketId);
        PredictionMarkets.Market memory afterCall = pm.getMarket(marketId);
        assertFalse(afterCall.schedulePending);
        assertEq(afterCall.reserve, before.reserve - pm.SCHEDULED_EXECUTION_COST());
        assertEq(uint256(afterCall.outcome), uint256(before.outcome));
        assertEq(afterCall.settlementTime, before.settlementTime);
    }

    function test_Settle_RefusesWhenWalkCannotReachExpiry() public {
        uint256 marketId = _createMarket();
        _stakeBothSides(marketId);
        hbarFeed.addRound(20_000_000, expiry - 100);
        // 50 rounds inside maxRoundLag: the first one (below strike) is out of the 48-step walk's reach, so
        // the walk cannot prove which round is first and must not settle on a later one (above strike).
        hbarFeed.addRound(10_000_000, expiry + 10);
        for (uint256 i = 1; i < 50; ++i) {
            hbarFeed.addRound(35_000_000, expiry + 10 + i * 60);
        }
        vm.warp(expiry + 1 hours);
        vm.expectRevert(PredictionMarkets.NoEligibleRound.selector);
        pm.settle(marketId);
    }

    function test_Settle_RetryExhaustedSelfCallReturnsAndCharges() public {
        uint256 marketId = _createMarket();
        _stakeBothSides(marketId);
        vm.warp(expiry + 5);
        vm.prank(address(pm));
        pm.settle(marketId);
        vm.prank(address(pm));
        pm.settle(marketId);
        assertEq(pm.getMarket(marketId).retriesLeft, 0);
        uint256 reserveBefore = pm.getMarket(marketId).reserve;
        uint256 totalBefore = pm.totalReserves();

        vm.expectEmit(true, false, false, false, address(pm));
        emit PredictionMarkets.SettlementRetriesExhausted(marketId);
        vm.prank(address(pm));
        pm.settle(marketId);

        PredictionMarkets.Market memory m = pm.getMarket(marketId);
        assertEq(uint256(m.state), uint256(State.Open));
        assertFalse(m.schedulePending);
        assertEq(m.reserve, reserveBefore - pm.SCHEDULED_EXECUTION_COST());
        assertEq(pm.totalReserves(), totalBefore - pm.SCHEDULED_EXECUTION_COST());
    }

    function test_Settle_ManualSettleStillRevertsAfterRetriesExhausted() public {
        uint256 marketId = _createMarket();
        _stakeBothSides(marketId);
        vm.warp(expiry + 5);
        for (uint256 i = 0; i < 3; i++) {
            vm.prank(address(pm));
            pm.settle(marketId);
        }
        vm.expectRevert(PredictionMarkets.NoEligibleRound.selector);
        pm.settle(marketId);
    }

    function test_Settle_SelfCallSkipsRetryWhenReserveBelowRetryCost() public {
        Config memory richRetry = Config({
            settlementDelay: 5 minutes,
            retryDelay: 10 minutes,
            maxRetries: 2,
            maxRoundLag: 2 hours,
            gracePeriod: 24 hours,
            minDuration: 5 minutes,
            maxDuration: 60 days,
            minReserve: MIN_RESERVE,
            retryCostEstimate: MIN_RESERVE + 1e8 + 1
        });
        bytes32[] memory keys = new bytes32[](1);
        keys[0] = HBAR;
        Feed[] memory feedsList = new Feed[](1);
        feedsList[0] = Feed({ chainlink: address(hbarFeed), pythId: PYTH_HBAR_ID });
        PredictionMarkets expensive = new PredictionMarkets(keys, feedsList, address(pyth), richRetry);
        vm.prank(CREATOR);
        // forge-lint: disable-next-line(arbitrary-send-eth)
        uint256 marketId = expensive.createMarket{ value: creationValue }(HBAR, STRIKE, expiry);
        vm.prank(ALICE);
        // forge-lint: disable-next-line(arbitrary-send-eth)
        expensive.stake{ value: 6e8 }(marketId, true);
        vm.prank(BOB);
        // forge-lint: disable-next-line(arbitrary-send-eth)
        expensive.stake{ value: 4e8 }(marketId, false);
        vm.warp(expiry + 5);
        vm.expectEmit(true, false, false, false, address(expensive));
        emit PredictionMarkets.SettlementRetriesExhausted(marketId);
        vm.prank(address(expensive));
        expensive.settle(marketId);
        assertEq(expensive.getMarket(marketId).retriesLeft, 2);
        assertFalse(expensive.getMarket(marketId).schedulePending);
    }

    function test_Settle_RefusesUnprovenRoundAtPhaseBoundary() public {
        uint256 marketId = _createMarket();
        _stakeBothSides(marketId);
        hbarFeed.addRoundWithId(500, 35_000_000, expiry + 10);
        hbarFeed.addRoundSpoofed(499, (uint80(7) << 64) | 499, 10_000_000, expiry + 5);
        vm.warp(expiry + 1000);
        // The previous phase holds an earlier round after expiry (below strike): the walk cannot cross the
        // boundary to check it, so it must not claim round 500 is the first.
        vm.expectRevert(PredictionMarkets.NoEligibleRound.selector);
        pm.settle(marketId);
    }

    function test_Settle_RefusesWhenPreviousRoundIsMissing() public {
        uint256 marketId = _createMarket();
        _stakeBothSides(marketId);
        hbarFeed.addRoundWithId(5, 10_000_000, expiry - 50);
        hbarFeed.addRoundWithId(10, 35_000_000, expiry + 10);
        vm.warp(expiry + 1000);
        // Round 9 reverts: rounds 6 to 9 could hold an earlier price after expiry.
        vm.expectRevert(PredictionMarkets.NoEligibleRound.selector);
        pm.settle(marketId);
    }

    function test_Settle_RefusesFirstRoundOfPhase() public {
        uint256 marketId = _createMarket();
        _stakeBothSides(marketId);
        hbarFeed.nextPhase();
        hbarFeed.addRound(35_000_000, expiry + 10);
        vm.warp(expiry + 1000);
        vm.expectRevert(PredictionMarkets.NoEligibleRound.selector);
        pm.settle(marketId);
    }

    function test_Settle_SkipsNonPositivePreviousRound() public {
        uint256 marketId = _createMarket();
        _stakeBothSides(marketId);
        hbarFeed.addRound(20_000_000, expiry - 100);
        hbarFeed.addRound(-5_000_000, expiry + 50);
        hbarFeed.addRound(35_000_000, expiry + 200);
        vm.warp(expiry + 1000);
        pm.settle(marketId);
        assertEq(pm.getMarket(marketId).settlementTime, expiry + 200);
    }

    function test_Settle_RefusesWhenOnlyInvalidRoundsFollowExpiry() public {
        uint256 marketId = _createMarket();
        _stakeBothSides(marketId);
        hbarFeed.addRound(20_000_000, expiry - 100);
        hbarFeed.addRound(0, expiry + 50);
        hbarFeed.addRound(-1, expiry + 100);
        vm.warp(expiry + 1000);
        vm.expectRevert(PredictionMarkets.NoEligibleRound.selector);
        pm.settle(marketId);
    }

    function test_Settle_RefusesToCrossIntoPreviousPhase() public {
        uint256 marketId = _createMarket();
        _stakeBothSides(marketId);
        // Round 500 (above strike) is preceded by a round reporting phase 7 (below strike, after expiry), whose
        // own predecessor is before expiry. Following it would "prove" a round of another phase; refuse instead.
        hbarFeed.addRoundWithId(500, 35_000_000, expiry + 10);
        hbarFeed.addRoundSpoofed(499, (uint80(7) << 64) | 499, 10_000_000, expiry + 5);
        hbarFeed.addRoundSpoofed((uint80(7) << 64) | 498, (uint80(7) << 64) | 498, 9_000_000, expiry - 100);
        vm.warp(expiry + 1000);
        vm.expectRevert(PredictionMarkets.NoEligibleRound.selector);
        pm.settle(marketId);
    }

    function test_Settle_ScheduledCallLeavesVoidedMarketAlone() public {
        uint256 marketId = _createMarket();
        _stakeBothSides(marketId);
        vm.warp(expiry + 24 hours);
        pm.voidMarket(marketId);
        uint256 callsBefore = hss.callCount();
        vm.prank(address(pm));
        pm.settle(marketId);
        PredictionMarkets.Market memory m = pm.getMarket(marketId);
        assertEq(uint256(m.state), uint256(State.Voided));
        assertEq(uint256(m.outcome), uint256(Outcome.Invalid));
        assertEq(hss.callCount(), callsBefore);
    }

    function test_Settle_RejectsRoundBeyondMaxLag() public {
        uint256 marketId = _createMarket();
        _stakeBothSides(marketId);
        hbarFeed.addRound(35_000_000, expiry + 2 hours + 1);
        vm.warp(expiry + 3 hours);
        vm.expectRevert(PredictionMarkets.NoEligibleRound.selector);
        pm.settle(marketId);
        vm.prank(address(pm));
        pm.settle(marketId);
        assertEq(pm.getMarket(marketId).retriesLeft, 1);
    }

    function test_Settle_RevertsBeforeExpiry() public {
        uint256 marketId = _createMarket();
        _stakeBothSides(marketId);
        _addSettlementRounds();
        vm.warp(expiry - 1);
        vm.expectRevert(PredictionMarkets.NotExpired.selector);
        pm.settle(marketId);
    }

    function test_Settle_RevertsWhenNotOpen() public {
        uint256 marketId = _createMarket();
        _stakeBothSides(marketId);
        _addSettlementRounds();
        vm.warp(expiry + 1000);
        pm.settle(marketId);
        vm.expectRevert(PredictionMarkets.MarketNotOpen.selector);
        pm.settle(marketId);
    }

    function test_Settle_RevertsUnknownMarket() public {
        vm.expectRevert(PredictionMarkets.InvalidMarketId.selector);
        pm.settle(999);
    }

    function test_Settle_RetryScheduleFailureReverts() public {
        uint256 marketId = _createMarket();
        _stakeBothSides(marketId);
        vm.warp(expiry + 5);
        hss.setResponseCode(33);
        vm.prank(address(pm));
        // forge-lint: disable-next-line(unsafe-typecast)
        vm.expectRevert(abi.encodeWithSelector(PredictionMarkets.ScheduleFailed.selector, int64(33)));
        pm.settle(marketId);
    }

    // Pyth settlement

    function _pythUpdate(uint64 publishTime, int64 price) internal pure returns (bytes[] memory updateData) {
        updateData = new bytes[](1);
        updateData[0] = abi.encode(PYTH_HBAR_ID, price, int32(-8), publishTime);
    }

    function test_SettleWithPyth_SettlesYesAndRefundsExcess() public {
        uint256 marketId = _createMarket();
        _stakeBothSides(marketId);
        bytes[] memory updateData = _pythUpdate(expiry, 35_000_000);
        uint256 fee = pyth.getUpdateFee(updateData);
        vm.warp(expiry + 2 hours);
        uint256 carolBefore = CAROL.balance;
        vm.expectEmit(true, false, false, true);
        // forge-lint: disable-next-line(reentrancy-events)
        emit PredictionMarkets.MarketSettled(marketId, Outcome.Yes, 3.5e17, expiry, PriceSource.Pyth);
        _settlePythAs(CAROL, marketId, updateData, fee + 5000);
        assertEq(CAROL.balance, carolBefore - fee);
        PredictionMarkets.Market memory m = pm.getMarket(marketId);
        assertEq(uint256(m.outcome), uint256(Outcome.Yes));
        assertEq(uint256(m.source), uint256(PriceSource.Pyth));
        assertEq(m.settlementPrice, 3.5e17);
        assertEq(m.settlementTime, expiry);
    }

    function test_SettleWithPyth_SettlesNo() public {
        uint256 marketId = _createMarket();
        _stakeBothSides(marketId);
        bytes[] memory updateData = _pythUpdate(expiry + 100, 25_000_000);
        uint256 fee = pyth.getUpdateFee(updateData);
        vm.warp(expiry + 2 hours);
        _settlePythAs(CAROL, marketId, updateData, fee);
        assertEq(uint256(pm.getMarket(marketId).outcome), uint256(Outcome.No));
    }

    function test_SettleWithPyth_RevertsStaleUpdate() public {
        uint256 marketId = _createMarket();
        _stakeBothSides(marketId);
        bytes[] memory updateData = _pythUpdate(expiry - 1, 35_000_000);
        uint256 fee = pyth.getUpdateFee(updateData);
        vm.warp(expiry + 2 hours);
        vm.expectRevert(abi.encodeWithSelector(MockPyth.PriceUnavailable.selector, PYTH_HBAR_ID));
        _settlePythAs(CAROL, marketId, updateData, fee);
    }

    function test_SettleWithPyth_RevertsUpdateBeyondLag() public {
        uint256 marketId = _createMarket();
        _stakeBothSides(marketId);
        bytes[] memory updateData = _pythUpdate(expiry + 2 hours + 1, 35_000_000);
        uint256 fee = pyth.getUpdateFee(updateData);
        vm.warp(expiry + 3 hours);
        vm.expectRevert(abi.encodeWithSelector(MockPyth.PriceUnavailable.selector, PYTH_HBAR_ID));
        _settlePythAs(CAROL, marketId, updateData, fee);
    }

    function test_SettleWithPyth_RevertsLowFee() public {
        uint256 marketId = _createMarket();
        _stakeBothSides(marketId);
        bytes[] memory updateData = _pythUpdate(expiry, 35_000_000);
        uint256 fee = pyth.getUpdateFee(updateData);
        vm.warp(expiry + 2 hours);
        vm.expectRevert(abi.encodeWithSelector(PredictionMarkets.PythFeeInsufficient.selector, fee - 1, fee));
        _settlePythAs(CAROL, marketId, updateData, fee - 1);
    }

    function test_SettleWithPyth_OneSidedMarketRefundsAll() public {
        uint256 marketId = _createMarket();
        _stakeAs(ALICE, marketId, true, 6e8);
        vm.warp(expiry + 1000);
        bytes[] memory empty;
        uint256 aliceBefore = ALICE.balance;
        _settlePythAs(ALICE, marketId, empty, 12345);
        assertEq(ALICE.balance, aliceBefore);
        assertEq(uint256(pm.getMarket(marketId).outcome), uint256(Outcome.Invalid));
    }

    function test_SettleWithPyth_RevertsFeeRefundFailure() public {
        uint256 marketId = _createMarket();
        _stakeBothSides(marketId);
        Rejector rejector = new Rejector(pm);
        vm.deal(address(rejector), 10e8);
        bytes[] memory updateData = _pythUpdate(expiry, 35_000_000);
        uint256 fee = pyth.getUpdateFee(updateData);
        vm.warp(expiry + 2 hours);
        vm.expectRevert(PredictionMarkets.FeeRefundFailed.selector);
        // forge-lint: disable-next-line(arbitrary-send-eth)
        rejector.settlePyth{ value: fee + 5000 }(marketId, updateData);
        assertEq(uint256(pm.getMarket(marketId).state), uint256(State.Open));
    }

    function test_SettleWithPyth_RevertsBeforeFallbackWindow() public {
        uint256 marketId = _createMarket();
        _stakeBothSides(marketId);
        bytes[] memory updateData = _pythUpdate(expiry, 35_000_000);
        vm.warp(expiry + 2 hours - 1);
        vm.expectRevert(PredictionMarkets.PythFallbackNotOpen.selector);
        _settlePythAs(CAROL, marketId, updateData, 1000);
    }

    function test_SettleWithPyth_RevertsWhenChainlinkRoundAvailable() public {
        uint256 marketId = _createMarket();
        _stakeBothSides(marketId);
        _addSettlementRounds();
        bytes[] memory updateData = _pythUpdate(expiry, 35_000_000);
        vm.warp(expiry + 3 hours);
        vm.expectRevert(PredictionMarkets.ChainlinkRoundAvailable.selector);
        _settlePythAs(CAROL, marketId, updateData, 1000);
    }

    function test_SettleWithPyth_AllowedWhenChainlinkRoundUnproven() public {
        uint256 marketId = _createMarket();
        _stakeBothSides(marketId);
        hbarFeed.nextPhase();
        hbarFeed.addRound(35_000_000, expiry + 10);
        bytes[] memory updateData = _pythUpdate(expiry + 5, 25_000_000);
        uint256 fee = pyth.getUpdateFee(updateData);
        vm.warp(expiry + 2 hours);
        _settlePythAs(CAROL, marketId, updateData, fee);
        assertEq(uint256(pm.getMarket(marketId).source), uint256(PriceSource.Pyth));
        assertEq(uint256(pm.getMarket(marketId).outcome), uint256(Outcome.No));
    }

    function test_SettleWithPyth_AllowedWhenChainlinkRoundIsTooLate() public {
        uint256 marketId = _createMarket();
        _stakeBothSides(marketId);
        hbarFeed.addRound(20_000_000, expiry - 100);
        hbarFeed.addRound(35_000_000, expiry + 2 hours + 1);
        bytes[] memory updateData = _pythUpdate(expiry + 5, 25_000_000);
        uint256 fee = pyth.getUpdateFee(updateData);
        vm.warp(expiry + 3 hours);
        _settlePythAs(CAROL, marketId, updateData, fee);
        assertEq(uint256(pm.getMarket(marketId).source), uint256(PriceSource.Pyth));
    }

    function test_SettleWithPyth_RevertsBeforeExpiry() public {
        uint256 marketId = _createMarket();
        _stakeBothSides(marketId);
        bytes[] memory updateData = _pythUpdate(expiry, 35_000_000);
        vm.warp(expiry - 1);
        vm.expectRevert(PredictionMarkets.NotExpired.selector);
        _settlePythAs(CAROL, marketId, updateData, 1000);
    }

    // Void

    function test_Void_RevertsBeforeGrace() public {
        uint256 marketId = _createMarket();
        _stakeBothSides(marketId);
        vm.warp(expiry + 24 hours - 1);
        vm.expectRevert(PredictionMarkets.GraceNotPassed.selector);
        pm.voidMarket(marketId);
    }

    function test_Void_VoidsAfterGrace() public {
        uint256 marketId = _createMarket();
        _stakeBothSides(marketId);
        vm.warp(expiry + 24 hours);
        vm.expectEmit(true, false, false, false);
        // forge-lint: disable-next-line(reentrancy-events)
        emit PredictionMarkets.MarketVoided(marketId);
        pm.voidMarket(marketId);
        PredictionMarkets.Market memory m = pm.getMarket(marketId);
        assertEq(uint256(m.state), uint256(State.Voided));
        assertEq(uint256(m.outcome), uint256(Outcome.Invalid));
    }

    function test_Void_RevertsWhenSettled() public {
        uint256 marketId = _createMarket();
        _stakeBothSides(marketId);
        _addSettlementRounds();
        vm.warp(expiry + 1000);
        pm.settle(marketId);
        vm.warp(expiry + 24 hours + 1);
        vm.expectRevert(PredictionMarkets.MarketNotOpen.selector);
        pm.voidMarket(marketId);
    }

    function test_Void_RevertsUnknownMarket() public {
        vm.expectRevert(PredictionMarkets.InvalidMarketId.selector);
        pm.voidMarket(999);
    }

    // Redemption

    function _settledYesMarket() internal returns (uint256 marketId) {
        marketId = _createMarket();
        _stakeAs(ALICE, marketId, true, 6e8);
        _stakeAs(BOB, marketId, true, 4e8);
        _stakeAs(CAROL, marketId, false, 10e8);
        _addSettlementRounds();
        vm.warp(expiry + 1000);
        pm.settle(marketId);
    }

    function test_Redeem_WinnersSplitPoolProRata() public {
        uint256 marketId = _settledYesMarket();
        PredictionMarkets.Market memory m = pm.getMarket(marketId);
        uint256 aliceBefore = ALICE.balance;
        uint256 bobBefore = BOB.balance;

        vm.expectEmit(true, false, false, true);
        // forge-lint: disable-next-line(reentrancy-events)
        emit PredictionMarkets.Redeemed(marketId, ALICE, true, 6e8, 12e8);
        vm.prank(ALICE);
        pm.redeem(marketId, true, 6e8);
        vm.prank(BOB);
        pm.redeem(marketId, true, 4e8);

        assertEq(ALICE.balance, aliceBefore + 12e8);
        assertEq(BOB.balance, bobBefore + 8e8);
        assertEq(hts.balanceOf(m.yesToken, ALICE), 0);
        assertEq(hts.balanceOf(m.yesToken, BOB), 0);
    }

    function test_Redeem_LoserReverts() public {
        uint256 marketId = _settledYesMarket();
        vm.prank(CAROL);
        vm.expectRevert(PredictionMarkets.NothingToRedeem.selector);
        pm.redeem(marketId, false, 10e8);
    }

    function test_Redeem_InvalidOutcomeRefundsOneToOne() public {
        uint256 marketId = _createMarket();
        _stakeAs(ALICE, marketId, true, 6e8);
        vm.warp(expiry);
        pm.settle(marketId);
        uint256 aliceBefore = ALICE.balance;
        vm.prank(ALICE);
        pm.redeem(marketId, true, 6e8);
        assertEq(ALICE.balance, aliceBefore + 6e8);
    }

    function test_Redeem_VoidedMarketRefunds() public {
        uint256 marketId = _createMarket();
        _stakeBothSides(marketId);
        vm.warp(expiry + 24 hours);
        pm.voidMarket(marketId);
        uint256 aliceBefore = ALICE.balance;
        vm.prank(ALICE);
        pm.redeem(marketId, true, 6e8);
        assertEq(ALICE.balance, aliceBefore + 6e8);
    }

    function test_Redeem_RevertsWhenOpen() public {
        uint256 marketId = _createMarket();
        _stakeAs(ALICE, marketId, true, 6e8);
        vm.prank(ALICE);
        vm.expectRevert(PredictionMarkets.MarketNotRedeemable.selector);
        pm.redeem(marketId, true, 6e8);
    }

    function test_Redeem_RevertsWhenWipeFails() public {
        uint256 marketId = _settledYesMarket();
        vm.prank(ALICE);
        // forge-lint: disable-next-line(unsafe-typecast)
        vm.expectRevert(abi.encodeWithSelector(PredictionMarkets.TokenWipeFailed.selector, int64(200)));
        pm.redeem(marketId, true, 7e8);
    }

    function test_Redeem_RevertsAmountTooLarge() public {
        uint256 marketId = _settledYesMarket();
        uint256 huge = 2 ** 63;
        vm.prank(ALICE);
        vm.expectRevert(PredictionMarkets.AmountTooLarge.selector);
        pm.redeem(marketId, true, huge);
    }

    function test_Redeem_RevertsPayoutFailure() public {
        uint256 marketId = _createMarket();
        Rejector rejector = new Rejector(pm);
        vm.deal(address(rejector), 10e8);
        // forge-lint: disable-next-line(arbitrary-send-eth)
        rejector.stakeYes{ value: 6e8 }(marketId);
        _stakeAs(BOB, marketId, false, 4e8);
        _addSettlementRounds();
        vm.warp(expiry + 1000);
        pm.settle(marketId);
        vm.expectRevert(PredictionMarkets.PayoutTransferFailed.selector);
        rejector.redeemTokens(marketId, true, 6e8);
    }

    function test_Redeem_RevertsUnknownMarket() public {
        vm.expectRevert(PredictionMarkets.InvalidMarketId.selector);
        pm.redeem(999, true, 1);
    }

    // Reserve withdrawal

    function test_WithdrawReserve_HoldsBackPendingExecutionThenReleasesIt() public {
        uint256 marketId = _settledYesMarket();
        uint256 cost = pm.SCHEDULED_EXECUTION_COST();
        uint256 reserve = pm.getMarket(marketId).reserve;
        assertTrue(reserve >= MIN_RESERVE);
        uint256 creatorBefore = CREATOR.balance;
        vm.expectEmit(true, false, false, true);
        // forge-lint: disable-next-line(reentrancy-events)
        emit PredictionMarkets.ReserveWithdrawn(marketId, CREATOR, reserve - cost);
        vm.prank(CREATOR);
        pm.withdrawReserve(marketId);
        assertEq(CREATOR.balance, creatorBefore + reserve - cost);
        assertEq(pm.getMarket(marketId).reserve, cost);
        assertEq(pm.totalReserves(), cost);
        // Nothing more until the booked schedule has run.
        vm.prank(CREATOR);
        vm.expectRevert(PredictionMarkets.NoReserve.selector);
        pm.withdrawReserve(marketId);
        // The schedule fires and spends the holdback; the reserve is then fully accounted for.
        vm.prank(address(pm));
        pm.settle(marketId);
        assertEq(pm.getMarket(marketId).reserve, 0);
        assertEq(pm.totalReserves(), 0);
        vm.prank(CREATOR);
        vm.expectRevert(PredictionMarkets.NoReserve.selector);
        pm.withdrawReserve(marketId);
    }

    function test_WithdrawReserve_CreatorWithdrawsOnce() public {
        uint256 marketId = _settledYesMarket();
        // The booked schedule already ran, so there is no holdback.
        vm.prank(address(pm));
        pm.settle(marketId);
        uint256 expected = pm.getMarket(marketId).reserve;
        uint256 creatorBefore = CREATOR.balance;
        vm.expectEmit(true, false, false, true);
        // forge-lint: disable-next-line(reentrancy-events)
        emit PredictionMarkets.ReserveWithdrawn(marketId, CREATOR, expected);
        vm.prank(CREATOR);
        pm.withdrawReserve(marketId);
        assertEq(CREATOR.balance, creatorBefore + expected);
        assertEq(pm.getMarket(marketId).reserve, 0);
        vm.prank(CREATOR);
        vm.expectRevert(PredictionMarkets.NoReserve.selector);
        pm.withdrawReserve(marketId);
    }

    function test_WithdrawReserve_CapsAtSurplusSoTradersStayWhole() public {
        uint256 marketId = _settledYesMarket();
        vm.prank(address(pm));
        pm.settle(marketId);
        // The network bills the scheduled execution the reserve was charged for.
        vm.deal(address(pm), address(pm).balance - pm.SCHEDULED_EXECUTION_COST());
        uint256 recorded = pm.getMarket(marketId).reserve;
        // Simulate network fees that cost more than the reserve estimated: 1 HBAR leaves the contract.
        uint256 shortfall = 1e8;
        vm.deal(address(pm), address(pm).balance - shortfall);

        uint256 creatorBefore = CREATOR.balance;
        vm.prank(CREATOR);
        pm.withdrawReserve(marketId);
        assertEq(CREATOR.balance, creatorBefore + recorded - shortfall);
        assertEq(pm.totalReserves(), 0);

        // Winners still receive the full pool after the creator absorbed the shortfall.
        vm.prank(ALICE);
        pm.redeem(marketId, true, 6e8);
        vm.prank(BOB);
        pm.redeem(marketId, true, 4e8);
        assertEq(pm.totalPoolLiability(), 0);
    }

    function test_WithdrawReserve_RevertsWhenNothingIsAvailable() public {
        uint256 marketId = _settledYesMarket();
        vm.deal(address(pm), pm.totalPoolLiability());
        vm.prank(CREATOR);
        vm.expectRevert(PredictionMarkets.NoReserve.selector);
        pm.withdrawReserve(marketId);
    }

    function test_Liability_TracksStakesAndPayouts() public {
        uint256 marketId = _settledYesMarket();
        assertEq(pm.totalPoolLiability(), 20e8);
        assertEq(pm.totalReserves(), pm.getMarket(marketId).reserve);
        vm.prank(ALICE);
        pm.redeem(marketId, true, 6e8);
        assertEq(pm.totalPoolLiability(), 20e8 - 12e8);
    }

    function test_WithdrawReserve_RevertsNonCreator() public {
        uint256 marketId = _settledYesMarket();
        vm.prank(ALICE);
        vm.expectRevert(PredictionMarkets.NotMarketCreator.selector);
        pm.withdrawReserve(marketId);
    }

    function test_WithdrawReserve_RevertsBeforeSettlement() public {
        uint256 marketId = _createMarket();
        vm.prank(CREATOR);
        vm.expectRevert(PredictionMarkets.MarketNotSettled.selector);
        pm.withdrawReserve(marketId);
    }

    // Views and fuzz

    function test_QuotePayout_UnresolvedIsZero() public {
        uint256 marketId = _createMarket();
        _stakeAs(ALICE, marketId, true, 6e8);
        assertEq(pm.quotePayout(marketId, true, 6e8), 0);
        assertEq(pm.quotePayout(marketId, false, 6e8), 0);
    }

    function test_QuotePayout_InvalidRefundsStake() public {
        uint256 marketId = _createMarket();
        _stakeAs(ALICE, marketId, true, 6e8);
        vm.warp(expiry);
        pm.settle(marketId);
        assertEq(pm.quotePayout(marketId, true, 6e8), 6e8);
    }

    function test_QuotePayout_WinnerAndLoser() public {
        uint256 marketId = _settledYesMarket();
        assertEq(pm.quotePayout(marketId, true, 6e8), 12e8);
        assertEq(pm.quotePayout(marketId, false, 10e8), 0);
    }

    function test_Getters() public {
        _createMarket();
        _createMarket();
        assertEq(pm.marketCount(), 2);
        bytes32[] memory keys = pm.feedKeys();
        assertEq(keys.length, 3);
        assertEq(keys[0], HBAR);
        (address chainlink, bytes32 pythId) = pm.feeds(HBAR);
        assertEq(chainlink, address(hbarFeed));
        assertEq(pythId, PYTH_HBAR_ID);
        vm.expectRevert(PredictionMarkets.InvalidMarketId.selector);
        // forge-lint: disable-next-line(unused-return)
        pm.getMarket(2);
    }

    function testFuzz_WinnersNeverExceedPool(uint256 yesA, uint256 yesB, uint256 noC) public {
        yesA = bound(yesA, 1, 1e12);
        yesB = bound(yesB, 1, 1e12);
        noC = bound(noC, 1, 1e12);
        vm.deal(ALICE, yesA + 1e12);
        vm.deal(BOB, yesB + 1e12);
        vm.deal(CAROL, noC + 1e12);

        uint256 marketId = _createMarket();
        _stakeAs(ALICE, marketId, true, yesA);
        _stakeAs(BOB, marketId, true, yesB);
        _stakeAs(CAROL, marketId, false, noC);

        hbarFeed.addRound(20_000_000, expiry - 100);
        hbarFeed.addRound(35_000_000, expiry + 1);
        vm.warp(expiry + 1000);
        pm.settle(marketId);

        uint256 total = yesA + yesB + noC;
        uint256 payoutA = pm.quotePayout(marketId, true, yesA);
        uint256 payoutB = pm.quotePayout(marketId, true, yesB);
        assertLe(payoutA + payoutB, total);
        assertEq(pm.quotePayout(marketId, false, noC), 0);

        uint256 aliceBefore = ALICE.balance;
        vm.prank(ALICE);
        pm.redeem(marketId, true, yesA);
        assertEq(ALICE.balance, aliceBefore + payoutA);
    }

    function testFuzz_InvalidRefundsExactlyStakes(uint256 yesA, uint256 yesB) public {
        yesA = bound(yesA, 1, 1e12);
        yesB = bound(yesB, 1, 1e12);
        vm.deal(ALICE, yesA + 1e12);
        vm.deal(BOB, yesB + 1e12);

        uint256 marketId = _createMarket();
        _stakeAs(ALICE, marketId, true, yesA);
        _stakeAs(BOB, marketId, true, yesB);

        vm.warp(expiry);
        pm.settle(marketId);
        assertEq(uint256(pm.getMarket(marketId).outcome), uint256(Outcome.Invalid));
        assertEq(pm.quotePayout(marketId, true, yesA), yesA);
        assertEq(pm.quotePayout(marketId, true, yesB), yesB);

        uint256 aliceBefore = ALICE.balance;
        uint256 bobBefore = BOB.balance;
        vm.prank(ALICE);
        pm.redeem(marketId, true, yesA);
        vm.prank(BOB);
        pm.redeem(marketId, true, yesB);
        assertEq(ALICE.balance, aliceBefore + yesA);
        assertEq(BOB.balance, bobBefore + yesB);
    }
}
