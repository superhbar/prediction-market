// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { Config, Feed, Outcome, PredictionMarkets, State } from "../contracts/PredictionMarkets.sol";
import { MockHTS } from "./mocks/MockHTS.sol";
import { MockHSS } from "./mocks/MockHSS.sol";
import { MockAggregator } from "./mocks/MockAggregator.sol";

/// @notice Drives random sequences of every market action across several markets and traders.
/// @dev Each action bounds its inputs and returns early when the action cannot apply, so the
///      fuzzer spends its calls on reachable states. Scheduled calls fire only once their booked
///      time has passed, as on Hedera, and each one bills the contract what testnet measured.
contract MarketsHandler is Test {
    /// @notice Measured testnet cost of one scheduled settle execution (0.104 HBAR).
    uint256 internal constant EXECUTION_BILL = 0.104e8;
    /// @notice Measured testnet cost of booking one retry (1.17 HBAR).
    uint256 internal constant RETRY_BILL = 1.17e8;
    /// @notice Two HTS creation fees plus the minimum reserve plus 1 HBAR headroom.
    uint256 internal constant CREATION_VALUE = 2 * 1e8 + 8.5e8 + 1e8;

    PredictionMarkets internal immutable pm;
    MockHTS internal immutable hts;
    MockHSS internal immutable hss;
    MockAggregator internal immutable feed;

    address[3] internal traders = [address(0xA11CE), address(0xB0B), address(0xCA201)];
    address internal constant CREATOR = address(0xC4EA704);

    /// @notice When the pending schedule of each market may run, from the Schedule Service record.
    mapping(uint256 => uint256) public scheduledAt;
    /// @notice HBAR paid out by redeem, per market.
    mapping(uint256 => uint256) public paidOut;
    /// @notice State and outcome recorded the first time a market closes.
    mapping(uint256 => State) public closedState;
    mapping(uint256 => Outcome) public closedOutcome;
    mapping(uint256 => bool) public closed;
    /// @notice HBAR the network billed the contract for scheduled work, in total.
    uint256 public networkBilled;

    constructor(PredictionMarkets pm_, MockHTS hts_, MockHSS hss_, MockAggregator feed_) {
        pm = pm_;
        hts = hts_;
        hss = hss_;
        feed = feed_;
        vm.deal(CREATOR, 1_000_000e8);
        for (uint256 i = 0; i < traders.length; ++i) {
            vm.deal(traders[i], 1_000_000e8);
        }
    }

    function traderAt(uint256 seed) internal view returns (address) {
        return traders[seed % traders.length];
    }

    /// @notice Returns an existing market id for a seed, or false when none exists yet.
    function marketAt(uint256 seed) internal view returns (uint256 id, bool ok) {
        uint256 count = pm.marketCount();
        if (count == 0) return (0, false);
        return (seed % count, true);
    }

    /// @notice Records when the schedule booked by the last call may run.
    function recordBooking(uint256 id, uint256 callsBefore) internal {
        uint256 callsAfter = hss.callCount();
        if (callsAfter > callsBefore) {
            (, uint256 at,) = hss.callArgs(callsAfter - 1);
            scheduledAt[id] = at;
        }
    }

    function recordClose(uint256 id) internal {
        PredictionMarkets.Market memory m = pm.getMarket(id);
        if (!closed[id] && m.state != State.Open) {
            closed[id] = true;
            closedState[id] = m.state;
            closedOutcome[id] = m.outcome;
        }
    }

    function createMarket(uint256 durationSeed) external {
        if (pm.marketCount() >= 8) return;
        uint64 expiry = uint64(block.timestamp + bound(durationSeed, 5 minutes, 1 days));
        uint256 callsBefore = hss.callCount();
        vm.prank(CREATOR);
        uint256 id = pm.createMarket{ value: CREATION_VALUE }("HBAR/USD", 3e17, expiry);
        recordBooking(id, callsBefore);
    }

    /// @notice The first market still trading, starting from the seed, so most stakes land.
    function tradingMarket(uint256 seed) internal view returns (uint256 id, bool ok) {
        uint256 count = pm.marketCount();
        for (uint256 i = 0; i < count; ++i) {
            id = (seed + i) % count;
            PredictionMarkets.Market memory m = pm.getMarket(id);
            if (m.state == State.Open && block.timestamp < m.expiry) return (id, true);
        }
        return (0, false);
    }

    function stake(uint256 traderSeed, uint256 marketSeed, bool yes, uint256 amount) external {
        (uint256 id, bool ok) = tradingMarket(marketSeed);
        if (!ok) return;
        vm.prank(traderAt(traderSeed));
        pm.stake{ value: bound(amount, 1, 50e8) }(id, yes);
    }

    /// @notice Two traders take opposite sides, so markets often have both pools filled at expiry.
    function stakeBothSides(uint256 traderSeed, uint256 marketSeed, uint256 yesAmount, uint256 noAmount) external {
        (uint256 id, bool ok) = tradingMarket(marketSeed);
        if (!ok) return;
        vm.prank(traderAt(traderSeed));
        pm.stake{ value: bound(yesAmount, 1, 50e8) }(id, true);
        vm.prank(traderAt(traderSeed + 1));
        pm.stake{ value: bound(noAmount, 1, 50e8) }(id, false);
    }

    /// @notice Moves position tokens between traders, as a SaucerSwap trade would.
    function transferTokens(uint256 fromSeed, uint256 toSeed, uint256 marketSeed, bool yes, uint256 amount) external {
        (uint256 id, bool ok) = marketAt(marketSeed);
        if (!ok) return;
        PredictionMarkets.Market memory m = pm.getMarket(id);
        address token = yes ? m.yesToken : m.noToken;
        address from = traderAt(fromSeed);
        uint256 balance = hts.balanceOf(token, from);
        if (balance == 0) return;
        // forge-lint: disable-next-line(unsafe-typecast)
        hts.transferToken(token, from, traderAt(toSeed), int64(uint64(bound(amount, 1, balance))));
    }

    /// @notice Testnet feeds go quiet for hours; while quiet, no rounds are published.
    bool public feedQuiet;

    function toggleFeed() external {
        feedQuiet = !feedQuiet;
    }

    function publishRound(uint256 priceSeed) external {
        if (feedQuiet) return;
        // forge-lint: disable-next-line(unsafe-typecast)
        feed.addRound(int256(bound(priceSeed, 0.2e8, 0.4e8)), block.timestamp);
    }

    function warp(uint256 secondsSeed) external {
        vm.warp(block.timestamp + bound(secondsSeed, 1, 3 hours));
    }

    /// @notice The network runs a market's pending schedule once its time has come, and bills for it.
    function runSchedule(uint256 marketSeed) external {
        (uint256 id, bool ok) = marketAt(marketSeed);
        if (!ok) return;
        PredictionMarkets.Market memory before = pm.getMarket(id);
        if (!before.schedulePending || block.timestamp < scheduledAt[id]) return;
        uint256 callsBefore = hss.callCount();
        vm.prank(address(pm));
        pm.settle(id);
        uint256 bill = EXECUTION_BILL;
        if (pm.getMarket(id).retriesLeft < before.retriesLeft) bill += RETRY_BILL;
        vm.deal(address(pm), address(pm).balance - bill);
        networkBilled += bill;
        recordBooking(id, callsBefore);
        recordClose(id);
    }

    function settleByHand(uint256 traderSeed, uint256 marketSeed) external {
        (uint256 id, bool ok) = marketAt(marketSeed);
        if (!ok) return;
        vm.prank(traderAt(traderSeed));
        try pm.settle(id) { } catch { }
        recordClose(id);
    }

    function voidMarket(uint256 marketSeed) external {
        (uint256 id, bool ok) = marketAt(marketSeed);
        if (!ok) return;
        try pm.voidMarket(id) { } catch { }
        recordClose(id);
    }

    /// @notice Redeems from the first closed market where the trader holds tokens that pay out.
    function redeem(uint256 traderSeed, uint256 marketSeed, bool yes, uint256 amount) external {
        address trader = traderAt(traderSeed);
        uint256 count = pm.marketCount();
        for (uint256 i = 0; i < count; ++i) {
            uint256 id = (marketSeed + i) % count;
            PredictionMarkets.Market memory m = pm.getMarket(id);
            if (m.state == State.Open) continue;
            uint256 balance = hts.balanceOf(yes ? m.yesToken : m.noToken, trader);
            if (balance == 0 || pm.quotePayout(id, yes, balance) == 0) continue;
            uint256 redeemed = bound(amount, 1, balance);
            uint256 quote = pm.quotePayout(id, yes, redeemed);
            uint256 cashBefore = trader.balance;
            vm.prank(trader);
            try pm.redeem(id, yes, redeemed) {
                assertEq(trader.balance - cashBefore, quote, "redeem paid exactly the quote");
                paidOut[id] += quote;
            } catch { }
            return;
        }
    }

    function withdrawReserve(uint256 marketSeed) external {
        (uint256 id, bool ok) = marketAt(marketSeed);
        if (!ok) return;
        vm.prank(CREATOR);
        try pm.withdrawReserve(id) { } catch { }
    }
}

/// @notice Whole-system accounting invariants over random action sequences.
/// forge-config: default.invariant.runs = 128
/// forge-config: default.invariant.depth = 200
contract PredictionMarketsInvariantTest is Test {
    PredictionMarkets internal pm;
    MockHTS internal hts;
    MockAggregator internal feed;
    MarketsHandler internal handler;

    function setUp() public {
        // forge-lint: disable-next-line(unsafe-typecast)
        vm.etch(address(0x167), address(new MockHTS()).code);
        // forge-lint: disable-next-line(unsafe-typecast)
        vm.etch(address(0x16b), address(new MockHSS()).code);
        hts = MockHTS(payable(address(0x167)));
        MockHSS hss = MockHSS(address(0x16b));
        hts.setCreationFee(1e8);
        hss.setCapacity(true);
        hss.setResponseCode(22);

        vm.warp(1_000_000);
        feed = new MockAggregator();
        feed.addRound(0.3e8, block.timestamp);

        bytes32[] memory keys = new bytes32[](1);
        keys[0] = "HBAR/USD";
        Feed[] memory feeds = new Feed[](1);
        feeds[0] = Feed({ chainlink: address(feed), pythId: bytes32(uint256(1)) });
        Config memory cfg = Config({
            settlementDelay: 10 minutes,
            retryDelay: 30 minutes,
            maxRetries: 4,
            maxRoundLag: 2 hours,
            gracePeriod: 24 hours,
            minDuration: 5 minutes,
            maxDuration: 60 days,
            minReserve: 8.5e8,
            retryCostEstimate: 1.5e8
        });
        pm = new PredictionMarkets(keys, feeds, address(0xBEEF), cfg);
        handler = new MarketsHandler(pm, hts, hss, feed);
        targetContract(address(handler));
    }

    /// @notice What traders are owed is exactly what they staked minus what redeem paid them.
    function invariant_poolLiabilityIsStakesMinusPayouts() public view {
        uint256 staked;
        uint256 paid;
        for (uint256 id = 0; id < pm.marketCount(); ++id) {
            PredictionMarkets.Market memory m = pm.getMarket(id);
            staked += m.yesPool + m.noPool;
            paid += handler.paidOut(id);
            assertLe(handler.paidOut(id), m.yesPool + m.noPool, "a market paid out more than its pool");
        }
        assertEq(pm.totalPoolLiability(), staked - paid);
    }

    /// @notice The reserve total is the sum of every market's reserve.
    function invariant_reserveTotalMatchesMarkets() public view {
        uint256 sum;
        for (uint256 id = 0; id < pm.marketCount(); ++id) {
            sum += pm.getMarket(id).reserve;
        }
        assertEq(pm.totalReserves(), sum);
    }

    /// @notice After real network billing, the contract still holds every trader pool and every reserve.
    function invariant_solventAfterNetworkBilling() public view {
        assertGe(address(pm).balance, pm.totalPoolLiability() + pm.totalReserves());
    }

    /// @notice Every position token still outstanding can be redeemed in full from what is owed to traders.
    function invariant_outstandingTokensAreCovered() public view {
        uint256 claims;
        for (uint256 id = 0; id < pm.marketCount(); ++id) {
            PredictionMarkets.Market memory m = pm.getMarket(id);
            uint256 yesOut = hts.totalSupplyOf(m.yesToken);
            uint256 noOut = hts.totalSupplyOf(m.noToken);
            if (m.outcome == Outcome.Unresolved) claims += yesOut + noOut;
            else claims += pm.quotePayout(id, true, yesOut) + pm.quotePayout(id, false, noOut);
        }
        assertLe(claims, pm.totalPoolLiability());
    }

    /// @notice A closed market never reopens and its outcome never changes.
    function invariant_closedMarketsAreFinal() public view {
        for (uint256 id = 0; id < pm.marketCount(); ++id) {
            if (!handler.closed(id)) continue;
            PredictionMarkets.Market memory m = pm.getMarket(id);
            assertEq(uint8(m.state), uint8(handler.closedState(id)));
            assertEq(uint8(m.outcome), uint8(handler.closedOutcome(id)));
        }
    }
}
