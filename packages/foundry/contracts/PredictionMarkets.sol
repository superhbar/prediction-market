// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";
import { IHederaTokenService } from "hedera-forking/IHederaTokenService.sol";
import { IHederaScheduleService } from "./interfaces/IHederaScheduleService.sol";
import { IHtsWipe } from "./interfaces/IHtsWipe.sol";
import { IAggregatorV3 } from "./interfaces/IAggregatorV3.sol";
import { IPyth } from "./interfaces/IPyth.sol";
import { PriceMath } from "./libraries/PriceMath.sol";

/// @notice Unresolved market outcome. Invalid means every position token refunds 1:1.
enum Outcome {
    Unresolved,
    Yes,
    No,
    Invalid
}

/// @notice Market lifecycle state. Trading closes at expiry; settlement follows.
enum State {
    Open,
    Settled,
    Voided
}

/// @notice Which oracle settled the market. None covers one-sided markets settled without an oracle.
enum PriceSource {
    None,
    Chainlink,
    Pyth
}

/// @notice Oracle feeds for one market key, e.g. "HBAR/USD".
struct Feed {
    address chainlink;
    bytes32 pythId;
}

/// @notice Immutable deployment configuration.
struct Config {
    uint64 settlementDelay;
    uint64 retryDelay;
    uint8 maxRetries;
    uint64 maxRoundLag;
    uint64 gracePeriod;
    uint64 minDuration;
    uint64 maxDuration;
    uint256 minReserve;
    uint256 retryCostEstimate;
}

/// @title PredictionMarkets
/// @notice Binary price prediction markets settled by Chainlink push feeds with a Pyth pull fallback.
/// @dev One contract holds every market and is treasury, supply key and wipe key of all position tokens.
///      Value units inside the EVM are tinybar (8 decimals); the contract never rescales. No owner, no admin.
contract PredictionMarkets is ReentrancyGuard {
    /// @notice HTS precompile. Success response code.
    IHederaTokenService private constant HTS = IHederaTokenService(address(0x167));
    /// @notice Hedera Schedule Service (HIP-1215) precompile.
    IHederaScheduleService private constant HSS = IHederaScheduleService(address(0x16b));
    /// @notice HTS SUCCESS response code.
    int64 private constant SUCCESS = 22;
    /// @notice Gas forwarded to each scheduled settle call. 2.5M lets a scheduled call book its own retry.
    uint256 public constant SETTLE_GAS = 2_500_000;
    /// @notice HTS token decimals, matching tinybar.
    int32 private constant TOKEN_DECIMALS = 8;
    /// @notice Supply key (bit 4) plus wipe key (bit 3), both held by this contract.
    uint256 private constant SUPPLY_AND_WIPE_KEY = (1 << 4) | (1 << 3);
    /// @notice HTS auto-renew period for position tokens, 90 days.
    int64 private constant AUTO_RENEW_PERIOD = 7_776_000;
    /// @notice Reserve charged for each scheduled settle execution. The network bills the contract for the gas
    ///         used: a settle measured 127k gas (0.104 HBAR at 82 tinybar/gas) and a full 48-step round walk
    ///         stays under 0.5 HBAR.
    uint256 public constant SCHEDULED_EXECUTION_COST = 5e7;
    /// @notice Upper bound on the Chainlink round walk-back.
    uint256 private constant MAX_WALK_STEPS = 48;

    /// @notice Market record. Pools and reserve are in tinybar.
    struct Market {
        bytes32 feedKey;
        int256 strike;
        uint64 expiry;
        address creator;
        address yesToken;
        address noToken;
        uint256 yesPool;
        uint256 noPool;
        uint256 reserve;
        State state;
        Outcome outcome;
        PriceSource source;
        int256 settlementPrice;
        uint64 settlementTime;
        uint8 retriesLeft;
        address schedule;
        bool schedulePending;
    }

    /// @notice Pyth oracle contract.
    address public immutable pyth;
    /// @notice Delay after expiry before the scheduled settlement fires.
    uint64 public immutable settlementDelay;
    /// @notice Delay between settlement retries.
    uint64 public immutable retryDelay;
    /// @notice How many times a scheduled settlement reschedules itself when no round exists yet.
    uint8 public immutable maxRetries;
    /// @notice Latest a settlement round may be published after expiry.
    uint64 public immutable maxRoundLag;
    /// @notice Delay after expiry after which anyone may void an unsettled market.
    uint64 public immutable gracePeriod;
    /// @notice Minimum market duration from creation to expiry.
    uint64 public immutable minDuration;
    /// @notice Maximum market duration from creation to expiry.
    uint64 public immutable maxDuration;
    /// @notice Minimum settlement reserve a market must keep after token creation fees.
    uint256 public immutable minReserve;
    /// @notice Reserve consumed by each scheduled retry booking.
    uint256 public immutable retryCostEstimate;

    /// @notice Feed registry, keyed by feed key. Immutable after deploy.
    mapping(bytes32 => Feed) public feeds;
    /// @notice All markets by id.
    mapping(uint256 => Market) private _markets;
    /// @notice Number of markets created. Also the next market id.
    uint256 private _marketCount;
    /// @notice Feed keys in constructor order.
    bytes32[] private _feedKeys;
    /// @notice HBAR owed to traders across all markets: stakes in, payouts out. Never used for fees.
    uint256 public totalPoolLiability;
    /// @notice Sum of all markets' recorded reserves.
    uint256 public totalReserves;

    /// @notice Thrown when a feed key has no registered feed or has an empty Chainlink address.
    error FeedNotFound(bytes32 feedKey);
    /// @notice Thrown when the feed list and feed key list lengths differ.
    error FeedConfigMismatch();
    /// @notice Thrown when the strike is not positive.
    error InvalidStrike();
    /// @notice Thrown when expiry is outside [now + minDuration, now + maxDuration].
    error InvalidExpiry();
    /// @notice Thrown when the post-fee reserve is below the minimum.
    error InsufficientReserve(uint256 reserve, uint256 required);
    /// @notice Thrown when the network reports no schedule capacity at the settlement time.
    error NoScheduleCapacity();
    /// @notice Thrown when a schedule booking returns a non-SUCCESS response code.
    error ScheduleFailed(int64 responseCode);
    /// @notice Thrown when a market id is out of range.
    error InvalidMarketId();
    /// @notice Thrown when an action needs an Open market.
    error MarketNotOpen();
    /// @notice Thrown when staking at or after expiry.
    error TradingClosed();
    /// @notice Thrown when staking zero value.
    error ZeroStake();
    /// @notice Thrown when a stake does not fit in int64 for the HTS precompile.
    error StakeTooLarge();
    /// @notice Thrown when a redeem amount does not fit in int64 for the HTS precompile.
    error AmountTooLarge();
    /// @notice Thrown when HTS token creation fails.
    error TokenCreateFailed(int64 responseCode);
    /// @notice Thrown when HTS minting fails.
    error TokenMintFailed(int64 responseCode);
    /// @notice Thrown when an HTS transfer fails, e.g. the recipient is not associated.
    error TokenTransferFailed(int64 responseCode);
    /// @notice Thrown when wiping position tokens fails.
    error TokenWipeFailed(int64 responseCode);
    /// @notice Thrown when settling or voiding before the required time.
    error NotExpired();
    /// @notice Thrown when voiding before expiry plus the grace period.
    error GraceNotPassed();
    /// @notice Thrown when no Chainlink round at or after expiry exists within maxRoundLag.
    error NoEligibleRound();
    /// @notice Thrown when the Pyth fallback is used before every eligible Chainlink round would have published.
    error PythFallbackNotOpen();
    /// @notice Thrown when the Pyth fallback is used although a provably first Chainlink round exists.
    error ChainlinkRoundAvailable();
    /// @notice Thrown when the Pyth fee sent is below the required update fee.
    error PythFeeInsufficient(uint256 sent, uint256 required);
    /// @notice Thrown when refunding excess Pyth fee fails.
    error FeeRefundFailed();
    /// @notice Thrown when a payout transfer to the redeemer fails.
    error PayoutTransferFailed();
    /// @notice Thrown when redeeming a losing position or an unresolved market.
    error NothingToRedeem();
    /// @notice Thrown when redeeming a market that is neither settled nor voided.
    error MarketNotRedeemable();
    /// @notice Thrown when withdrawing a reserve that is not yet releasable.
    error MarketNotSettled();
    /// @notice Thrown when a non-creator withdraws a market reserve.
    error NotMarketCreator();
    /// @notice Thrown when withdrawing an empty reserve, including a second withdrawal.
    error NoReserve();

    /// @notice Emitted when a market is created with its tokens, schedule and reserve.
    event MarketCreated(
        uint256 indexed marketId,
        bytes32 feedKey,
        int256 strike,
        uint64 expiry,
        address creator,
        address yesToken,
        address noToken,
        address schedule,
        uint256 reserve
    );
    /// @notice Emitted when a trader stakes on a side.
    event Staked(uint256 indexed marketId, address account, bool yes, uint256 amount);
    /// @notice Emitted when a scheduled settlement finds no round yet and books a retry.
    event SettlementRetryScheduled(uint256 indexed marketId, address schedule, uint256 retryAt, uint8 retriesLeft);
    /// @notice The last scheduled settlement found no eligible round and could not book another retry.
    ///         The market stays Open: anyone can settle once a round lands, use Pyth, or void after grace.
    event SettlementRetriesExhausted(uint256 indexed marketId);
    /// @notice Emitted when a market settles with its outcome, normalized price and source.
    event MarketSettled(uint256 indexed marketId, Outcome outcome, int256 price, uint256 priceTime, PriceSource source);
    /// @notice Emitted when a market is voided after the grace period.
    event MarketVoided(uint256 indexed marketId);
    /// @notice Emitted when a trader redeems position tokens for a payout.
    event Redeemed(uint256 indexed marketId, address account, bool yes, uint256 amount, uint256 payout);
    /// @notice Emitted when the creator withdraws a market reserve.
    event ReserveWithdrawn(uint256 indexed marketId, address creator, uint256 amount);

    /// @notice Deploys the market registry with immutable feeds and configuration.
    /// @param feedKeys_ Feed keys such as "HBAR/USD", parallel to `feeds_`.
    /// @param feeds_ Oracle feeds, parallel to `feedKeys_`. Immutable after deploy.
    /// @param pyth_ Pyth oracle contract address used by the permissionless fallback.
    /// @param cfg_ Timing, horizon and reserve configuration.
    // forge-lint: disable-next-line(missing-zero-check)
    constructor(bytes32[] memory feedKeys_, Feed[] memory feeds_, address pyth_, Config memory cfg_) {
        if (feedKeys_.length != feeds_.length) revert FeedConfigMismatch();
        pyth = pyth_;
        settlementDelay = cfg_.settlementDelay;
        retryDelay = cfg_.retryDelay;
        maxRetries = cfg_.maxRetries;
        maxRoundLag = cfg_.maxRoundLag;
        gracePeriod = cfg_.gracePeriod;
        minDuration = cfg_.minDuration;
        maxDuration = cfg_.maxDuration;
        minReserve = cfg_.minReserve;
        retryCostEstimate = cfg_.retryCostEstimate;
        for (uint256 i = 0; i < feedKeys_.length; ++i) {
            // forge-lint: disable-next-line(require-revert-in-loop)
            if (feeds_[i].chainlink == address(0)) revert FeedNotFound(feedKeys_[i]);
            feeds[feedKeys_[i]] = feeds_[i];
            _feedKeys.push(feedKeys_[i]);
        }
    }

    /// @notice Creates a market with YES/NO position tokens and books its scheduled settlement.
    /// @dev Token creation fees are paid from `msg.value`; the remainder becomes the market reserve.
    /// @param feedKey Registered feed key, e.g. "HBAR/USD".
    /// @param strike Strike price in 1e18 fixed point. YES wins when settlement price >= strike.
    /// @param expiry Trading cutoff and settlement pivot as a unix timestamp.
    /// @return marketId The new market id.
    function createMarket(bytes32 feedKey, int256 strike, uint64 expiry) external payable returns (uint256 marketId) {
        if (feeds[feedKey].chainlink == address(0)) revert FeedNotFound(feedKey);
        if (strike <= 0) revert InvalidStrike();
        // forge-lint: disable-next-line(block-timestamp)
        if (expiry < block.timestamp + minDuration || expiry > block.timestamp + maxDuration) revert InvalidExpiry();

        marketId = _marketCount++;
        (address yesToken, address noToken, uint256 spent) = _createPositionTokens(marketId, msg.value);
        uint256 reserve = msg.value - spent;
        if (reserve < minReserve) revert InsufficientReserve(reserve, minReserve);
        address schedule = _bookSettlement(marketId, uint256(expiry) + settlementDelay);
        totalReserves += reserve;

        _markets[marketId] = Market({
            feedKey: feedKey,
            strike: strike,
            expiry: expiry,
            creator: msg.sender,
            yesToken: yesToken,
            noToken: noToken,
            yesPool: 0,
            noPool: 0,
            reserve: reserve,
            state: State.Open,
            outcome: Outcome.Unresolved,
            source: PriceSource.None,
            settlementPrice: 0,
            settlementTime: 0,
            retriesLeft: maxRetries,
            schedule: schedule,
            schedulePending: true
        });
        // forge-lint: disable-next-line(reentrancy-events)
        emit MarketCreated(marketId, feedKey, strike, expiry, msg.sender, yesToken, noToken, schedule, reserve);
    }

    /// @notice Stakes HBAR on a side and receives that side's position tokens 1:1 in tinybar.
    /// @dev Reverts when the staker is not associated with the position token (HTS transfer fails).
    /// @param marketId The market to stake on.
    /// @param yes True for YES, false for NO.
    function stake(uint256 marketId, bool yes) external payable {
        Market storage m = _getMarket(marketId);
        if (m.state != State.Open) revert MarketNotOpen();
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp >= m.expiry) revert TradingClosed();
        if (msg.value == 0) revert ZeroStake();
        // forge-lint: disable-next-line(unsafe-typecast)
        if (msg.value > uint256(uint64(type(int64).max))) revert StakeTooLarge();
        // forge-lint: disable-next-line(unsafe-typecast)
        int64 amount = int64(uint64(msg.value));

        address token = yes ? m.yesToken : m.noToken;
        // forge-lint: disable-next-line(unused-return)
        (int64 mintRc,,) = HTS.mintToken(token, amount, new bytes[](0));
        if (mintRc != SUCCESS) revert TokenMintFailed(mintRc);
        int64 transferRc = HTS.transferToken(token, address(this), msg.sender, amount);
        if (transferRc != SUCCESS) revert TokenTransferFailed(transferRc);

        if (yes) {
            m.yesPool += msg.value;
        } else {
            m.noPool += msg.value;
        }
        totalPoolLiability += msg.value;
        // forge-lint: disable-next-line(reentrancy-events)
        emit Staked(marketId, msg.sender, yes, msg.value);
    }

    /// @notice Settles an expired market on the first Chainlink round at or after expiry.
    /// @dev Callable by the scheduled call or permissionlessly. A scheduled call with no round yet
    ///      books a retry from the reserve, or emits SettlementRetriesExhausted when it cannot, and never
    ///      reverts; anyone else reverts NoEligibleRound.
    /// @param marketId The market to settle.
    function settle(uint256 marketId) external {
        Market storage m = _getMarket(marketId);
        if (msg.sender == address(this)) {
            // The network bills each scheduled execution to this contract, so charge it to the market's
            // reserve rather than to the shared balance that backs every pool. A schedule that fires after
            // someone settled the market by hand returns quietly: reverting would still be billed.
            m.schedulePending = false;
            _chargeReserve(m, SCHEDULED_EXECUTION_COST);
            if (m.state != State.Open) return;
        } else if (m.state != State.Open) {
            revert MarketNotOpen();
        }
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp < m.expiry) revert NotExpired();

        if (m.yesPool == 0 || m.noPool == 0) {
            _finalize(m, marketId, Outcome.Invalid, 0, 0, PriceSource.None);
            return;
        }

        (bool found, int256 price, uint256 priceTime) = _firstRoundAtOrAfter(m.feedKey, m.expiry);
        if (!found || priceTime > uint256(m.expiry) + maxRoundLag) {
            if (msg.sender == address(this) && m.retriesLeft > 0 && m.reserve >= retryCostEstimate) {
                uint256 retryAt = block.timestamp + retryDelay;
                (int64 rc, address schedule) =
                    HSS.scheduleCall(address(this), retryAt, SETTLE_GAS, 0, abi.encodeCall(this.settle, (marketId)));
                if (rc != SUCCESS) revert ScheduleFailed(rc);
                m.retriesLeft -= 1;
                _chargeReserve(m, retryCostEstimate);
                m.schedule = schedule;
                m.schedulePending = true;
                // forge-lint: disable-next-line(reentrancy-events)
                emit SettlementRetryScheduled(marketId, schedule, retryAt, m.retriesLeft);
                return;
            }
            // A scheduled call must not revert here: the revert would undo the reserve charge and the
            // schedulePending reset while the network still bills the contract for the execution.
            if (msg.sender == address(this)) {
                // forge-lint: disable-next-line(reentrancy-events)
                emit SettlementRetriesExhausted(marketId);
                return;
            }
            revert NoEligibleRound();
        }

        if (price >= m.strike) {
            _finalize(m, marketId, Outcome.Yes, price, priceTime, PriceSource.Chainlink);
        } else {
            _finalize(m, marketId, Outcome.No, price, priceTime, PriceSource.Chainlink);
        }
    }

    /// @notice Settles an expired market on the Pyth price published at expiry.
    /// @dev Permissionless fallback, only once Chainlink has provably failed: it opens at expiry plus
    ///      maxRoundLag (no later Chainlink round can still qualify) and refuses while a provably first
    ///      Chainlink round exists, so nobody can pick whichever oracle favours them. Only accepts the
    ///      first Pyth update at or after expiry via the publish-time window.
    /// @param marketId The market to settle.
    /// @param updateData Pyth price update bytes, fetched off-chain.
    function settleWithPyth(uint256 marketId, bytes[] calldata updateData) external payable {
        Market storage m = _getMarket(marketId);
        if (m.state != State.Open) revert MarketNotOpen();
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp < m.expiry) revert NotExpired();

        if (m.yesPool == 0 || m.noPool == 0) {
            _finalize(m, marketId, Outcome.Invalid, 0, 0, PriceSource.None);
            _refund(msg.sender, msg.value);
            return;
        }

        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp < uint256(m.expiry) + maxRoundLag) revert PythFallbackNotOpen();
        (bool chainlinkFound,, uint256 chainlinkTime) = _firstRoundAtOrAfter(m.feedKey, m.expiry);
        if (chainlinkFound && chainlinkTime <= uint256(m.expiry) + maxRoundLag) revert ChainlinkRoundAvailable();

        uint256 fee = IPyth(pyth).getUpdateFee(updateData);
        if (msg.value < fee) revert PythFeeInsufficient(msg.value, fee);
        bytes32[] memory priceIds = new bytes32[](1);
        priceIds[0] = feeds[m.feedKey].pythId;
        IPyth.PriceFeed[] memory priceFeeds = IPyth(pyth).parsePriceFeedUpdatesUnique{ value: fee }(
            updateData, priceIds, m.expiry, m.expiry + maxRoundLag
        );
        if (priceFeeds.length == 0) revert NoEligibleRound();
        int256 price = PriceMath.normalizePyth(priceFeeds[0].price.price, priceFeeds[0].price.expo);
        uint256 priceTime = priceFeeds[0].price.publishTime;

        if (price >= m.strike) {
            _finalize(m, marketId, Outcome.Yes, price, priceTime, PriceSource.Pyth);
        } else {
            _finalize(m, marketId, Outcome.No, price, priceTime, PriceSource.Pyth);
        }
        _refund(msg.sender, msg.value - fee);
    }

    /// @notice Voids an unsettled market after the grace period so funds are never stuck.
    /// @dev Anyone may call once block.timestamp >= expiry + gracePeriod. Outcome is Invalid (1:1 refunds).
    /// @param marketId The market to void.
    function voidMarket(uint256 marketId) external {
        Market storage m = _getMarket(marketId);
        if (m.state != State.Open) revert MarketNotOpen();
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp < uint256(m.expiry) + gracePeriod) revert GraceNotPassed();
        m.state = State.Voided;
        m.outcome = Outcome.Invalid;
        emit MarketVoided(marketId);
    }

    /// @notice Redeems `amount` position tokens for their payout, wiping them from the caller.
    /// @dev No approval step: the contract wipes with its wipe key, then pays HBAR. Pools are kept
    ///      for quote math; payouts always come from recorded accounting.
    /// @param marketId The market to redeem from.
    /// @param yes True to redeem YES tokens, false for NO tokens.
    /// @param amount Position token amount in tinybar units.
    function redeem(uint256 marketId, bool yes, uint256 amount) external nonReentrant {
        Market storage m = _getMarket(marketId);
        if (m.state != State.Settled && m.state != State.Voided) revert MarketNotRedeemable();
        uint256 payout = quotePayout(marketId, yes, amount);
        if (payout == 0) revert NothingToRedeem();
        // forge-lint: disable-next-line(unsafe-typecast)
        if (amount > uint256(uint64(type(int64).max))) revert AmountTooLarge();
        // forge-lint: disable-next-line(unsafe-typecast)
        int64 wipeAmount = int64(uint64(amount));

        address token = yes ? m.yesToken : m.noToken;
        int64 rc = IHtsWipe(address(HTS)).wipeTokenAccount(token, msg.sender, wipeAmount);
        if (rc != SUCCESS) revert TokenWipeFailed(rc);
        totalPoolLiability -= payout;
        (bool ok,) = msg.sender.call{ value: payout }("");
        if (!ok) revert PayoutTransferFailed();
        // forge-lint: disable-next-line(reentrancy-events)
        emit Redeemed(marketId, msg.sender, yes, amount, payout);
    }

    /// @notice Withdraws a settled or voided market's leftover reserve to its creator.
    /// @dev Network fees are only estimated in the reserve. Paying at most what the balance holds beyond every
    ///      trader pool and every other market's reserve means an underestimate is absorbed by this creator and
    ///      never by traders. While a booked schedule has not run yet (the market was settled by hand first),
    ///      one execution's cost stays in the reserve to pay for it; the creator can withdraw again afterwards.
    /// @param marketId The market whose reserve to withdraw.
    function withdrawReserve(uint256 marketId) external nonReentrant {
        Market storage m = _getMarket(marketId);
        if (msg.sender != m.creator) revert NotMarketCreator();
        if (m.state != State.Settled && m.state != State.Voided) revert MarketNotSettled();
        uint256 holdback = m.schedulePending ? SCHEDULED_EXECUTION_COST : 0;
        if (holdback > m.reserve) holdback = m.reserve;
        uint256 recorded = m.reserve - holdback;
        if (recorded == 0) revert NoReserve();
        uint256 owedToOthers = totalPoolLiability + totalReserves - recorded;
        uint256 available = address(this).balance > owedToOthers ? address(this).balance - owedToOthers : 0;
        uint256 amount = recorded < available ? recorded : available;
        m.reserve = holdback;
        totalReserves -= recorded;
        if (amount == 0) revert NoReserve();
        (bool ok,) = msg.sender.call{ value: amount }("");
        if (!ok) revert PayoutTransferFailed();
        // forge-lint: disable-next-line(reentrancy-events)
        emit ReserveWithdrawn(marketId, msg.sender, amount);
    }

    /// @notice Quotes the payout for `amount` position tokens. The frontend shows this number as-is.
    /// @dev Invalid outcome refunds 1:1; winners share the total pool pro-rata; losers get 0.
    /// @param marketId The market to quote.
    /// @param yes True for YES tokens, false for NO tokens.
    /// @param amount Position token amount in tinybar units.
    /// @return payout Payout in tinybar, 0 for losing sides and unresolved markets.
    function quotePayout(uint256 marketId, bool yes, uint256 amount) public view returns (uint256 payout) {
        Market storage m = _getMarket(marketId);
        if (m.outcome == Outcome.Unresolved) return 0;
        if (m.outcome == Outcome.Invalid) return amount;
        bool won = (m.outcome == Outcome.Yes) == yes;
        if (!won) return 0;
        uint256 winningPool = m.outcome == Outcome.Yes ? m.yesPool : m.noPool;
        if (winningPool == 0) return 0;
        return amount * (m.yesPool + m.noPool) / winningPool;
    }

    /// @notice Returns the full market record.
    /// @param marketId The market to read.
    /// @return market The market struct.
    function getMarket(uint256 marketId) external view returns (Market memory market) {
        if (marketId >= _marketCount) revert InvalidMarketId();
        return _markets[marketId];
    }

    /// @notice Returns the number of markets created.
    /// @return count The market count.
    function marketCount() external view returns (uint256 count) {
        return _marketCount;
    }

    /// @notice Returns all registered feed keys in constructor order.
    /// @return keys The feed keys.
    function feedKeys() external view returns (bytes32[] memory keys) {
        return _feedKeys;
    }

    /// @notice Creates the YES and NO position tokens, forwarding the creation payment.
    /// @dev Forwards the full payment to the first creation and the remainder to the second, so the
    ///      measured spend equals the exact HTS fees and the rest stays in this contract.
    /// @return yesToken The YES position token.
    /// @return noToken The NO position token.
    /// @return spent HBAR consumed by both creations, measured via balance deltas.
    function _createPositionTokens(uint256 marketId, uint256 valueIn)
        internal
        returns (address yesToken, address noToken, uint256 spent)
    {
        uint256 balanceBefore = address(this).balance - valueIn;
        yesToken = _createPositionToken(
            string.concat("PM-", Strings.toString(marketId), " YES"),
            string.concat("YES", Strings.toString(marketId)),
            marketId,
            valueIn
        );
        noToken = _createPositionToken(
            string.concat("PM-", Strings.toString(marketId), " NO"),
            string.concat("NO", Strings.toString(marketId)),
            marketId,
            address(this).balance - balanceBefore
        );
        spent = balanceBefore + valueIn - address(this).balance;
    }

    /// @notice Books the scheduled settlement call for a market.
    /// @return schedule The schedule address returned by the Schedule Service.
    function _bookSettlement(uint256 marketId, uint256 settleAt) internal returns (address schedule) {
        if (!HSS.hasScheduleCapacity(settleAt, SETTLE_GAS)) revert NoScheduleCapacity();
        (int64 rc, address scheduledAt) =
            HSS.scheduleCall(address(this), settleAt, SETTLE_GAS, 0, abi.encodeCall(this.settle, (marketId)));
        if (rc != SUCCESS) revert ScheduleFailed(rc);
        return scheduledAt;
    }

    /// @notice Creates one HTS position token with this contract as treasury, supply key and wipe key.
    /// @dev Forwards `valueToForward` to cover the creation fee; unspent value stays in this contract.
    function _createPositionToken(string memory name, string memory symbol, uint256 marketId, uint256 valueToForward)
        internal
        returns (address tokenAddress)
    {
        IHederaTokenService.TokenKey[] memory keys = new IHederaTokenService.TokenKey[](1);
        keys[0] = IHederaTokenService.TokenKey({
            keyType: SUPPLY_AND_WIPE_KEY,
            key: IHederaTokenService.KeyValue({
                inheritAccountKey: false,
                contractId: address(this),
                ed25519: "",
                ECDSA_secp256k1: "",
                delegatableContractId: address(0)
            })
        });
        IHederaTokenService.HederaToken memory token;
        token.name = name;
        token.symbol = symbol;
        token.treasury = address(this);
        token.memo = string.concat("Prediction market ", Strings.toString(marketId));
        token.tokenKeys = keys;
        token.expiry = IHederaTokenService.Expiry({
            second: 0, autoRenewAccount: address(this), autoRenewPeriod: AUTO_RENEW_PERIOD
        });
        // forge-lint: disable-next-line(unsafe-typecast)
        (int64 rc, address created) = HTS.createFungibleToken{ value: valueToForward }(token, 0, TOKEN_DECIMALS);
        if (rc != SUCCESS) revert TokenCreateFailed(rc);
        return created;
    }

    /// @notice Finds the first Chainlink round with updatedAt >= expiry, walking back from latest.
    /// @dev A candidate is only returned once it is PROVEN first: the walk must reach an earlier round of the
    ///      same phase with updatedAt < expiry. Rounds with a non-positive answer are skipped (not a price).
    ///      Anything that stops the walk without that proof (48-step bound, phase boundary, first round of a
    ///      phase, a reverting or empty round) returns not found, so the market falls back to a retry, Pyth
    ///      or voiding instead of settling on a round that may not be the first.
    /// @return found Whether a provably first round exists.
    /// @return price The round price normalized to 1e18.
    /// @return priceTime The round updatedAt timestamp.
    function _firstRoundAtOrAfter(bytes32 feedKey, uint64 expiry)
        internal
        view
        returns (bool found, int256 price, uint256 priceTime)
    {
        IAggregatorV3 feed = IAggregatorV3(feeds[feedKey].chainlink);
        // The candidate is the earliest valid (positive) round at or after expiry seen so far; a
        // non-positive candidateAnswer means none has been seen yet.
        // forge-lint: disable-next-line(unused-return)
        (uint80 cursor, int256 candidateAnswer,, uint256 candidateTime,) = feed.latestRoundData();
        if (candidateTime < expiry || candidateTime == 0) {
            // forge-lint: disable-next-line(boolean-cst)
            return (false, 0, 0);
        }

        for (uint256 steps = 0; steps < MAX_WALK_STEPS; ++steps) {
            // forge-lint: disable-next-line(unsafe-typecast)
            if (uint64(cursor) <= 1) break;
            // forge-lint: disable-next-line(calls-loop)
            try feed.getRoundData(cursor - 1) returns (
                uint80 prevRoundId,
                int256 prevAnswer,
                uint256, /*startedAt*/
                uint256 prevUpdatedAt,
                uint80 /*answeredInRound*/
            ) {
                if ((prevRoundId >> 64) != (cursor >> 64) || prevUpdatedAt == 0) break;
                if (prevUpdatedAt < expiry) {
                    found = candidateAnswer > 0;
                    break;
                }
                cursor = prevRoundId;
                if (prevAnswer > 0) {
                    candidateAnswer = prevAnswer;
                    candidateTime = prevUpdatedAt;
                }
            } catch {
                break;
            }
        }
        if (!found) {
            // forge-lint: disable-next-line(boolean-cst)
            return (false, 0, 0);
        }
        price = PriceMath.normalizeChainlink(candidateAnswer, feed.decimals());
        priceTime = candidateTime;
    }

    /// @notice Deducts an estimated network cost from a market's reserve, saturating at zero.
    function _chargeReserve(Market storage m, uint256 cost) internal {
        uint256 charged = m.reserve < cost ? m.reserve : cost;
        m.reserve -= charged;
        totalReserves -= charged;
    }

    /// @notice Marks a market settled and emits its outcome.
    function _finalize(
        Market storage m,
        uint256 marketId,
        Outcome outcome,
        int256 price,
        uint256 priceTime,
        PriceSource source
    ) internal {
        m.state = State.Settled;
        m.outcome = outcome;
        m.source = source;
        m.settlementPrice = price;
        // forge-lint: disable-next-line(unsafe-typecast)
        m.settlementTime = uint64(priceTime);
        // forge-lint: disable-next-line(reentrancy-events)
        emit MarketSettled(marketId, outcome, price, priceTime, source);
    }

    /// @notice Sends `amount` HBAR back to `to`, no-op on zero. Reverts when the transfer fails.
    function _refund(address to, uint256 amount) internal {
        if (amount == 0) return;
        // forge-lint: disable-next-line(arbitrary-send-eth)
        (bool ok,) = to.call{ value: amount }("");
        if (!ok) revert FeeRefundFailed();
    }

    /// @notice Loads a market or reverts on an out-of-range id.
    function _getMarket(uint256 marketId) internal view returns (Market storage m) {
        if (marketId >= _marketCount) revert InvalidMarketId();
        return _markets[marketId];
    }
}
