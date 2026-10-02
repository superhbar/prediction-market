// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IHederaTokenService} from "hedera-forking/IHederaTokenService.sol";

interface IHederaScheduleService {
    function scheduleCall(address to, uint256 expirySecond, uint256 gasLimit, uint64 value, bytes memory callData)
        external
        returns (int64 responseCode, address scheduleAddress);
    function hasScheduleCapacity(uint256 expirySecond, uint256 gasLimit) external view returns (bool hasCapacity);
}

/// hedera-forking comments wipe out of its interface (not emulated locally), so declare it here.
interface IHtsWipe {
    function wipeTokenAccount(address token, address account, int64 amount) external returns (int64 responseCode);
}

interface IAggregatorV3 {
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80);
    function getRoundData(uint80 roundId) external view returns (uint80, int256, uint256, uint256, uint80);
}

/// Throwaway feasibility spike. Answers four questions on testnet:
/// 1. Can a contract create an HTS token with itself as treasury and supply key, and what does it cost?
/// 2. Does a direct (non-delegatecall) HIP-1215 scheduleCall back into this contract execute on time?
/// 3. How far ahead can a call be scheduled (hasScheduleCapacity probe)?
/// 4. Can we find the first Chainlink round at or after a timestamp by walking back from latest?
contract Spike {
    IHederaTokenService constant HTS = IHederaTokenService(address(0x167));
    IHederaScheduleService constant HSS = IHederaScheduleService(address(0x16b));
    int64 constant SUCCESS = 22;

    address public token;
    address public lastSchedule;
    uint256 public scheduledFor;
    uint256 public executedAt;
    int256 public settledAnswer;
    uint256 public settledUpdatedAt;
    uint80 public settledRound;
    uint256 public walkSteps;

    event TokenCreated(address token, int64 rc, uint256 balanceBefore, uint256 balanceAfter);
    event Scheduled(address schedule, int64 rc, uint256 expiry);
    event ValueSeen(uint256 msgValue);
    event Wiped(address from, int64 amount, int64 rc);
    event Rescheduled(address schedule, int64 rc, uint256 expiry, uint256 balance);
    event Executed(uint256 at, int256 answer, uint256 updatedAt, uint80 roundId, uint256 steps);

    receive() external payable {}

    function createToken(string calldata name, string calldata symbol, int64 initialSupply) external payable {
        IHederaTokenService.TokenKey[] memory keys = new IHederaTokenService.TokenKey[](1);
        keys[0] = IHederaTokenService.TokenKey({
            keyType: (1 << 4) | (1 << 3), // supply + wipe key
            key: IHederaTokenService.KeyValue({
                inheritAccountKey: false,
                contractId: address(this),
                ed25519: "",
                ECDSA_secp256k1: "",
                delegatableContractId: address(0)
            })
        });
        IHederaTokenService.HederaToken memory t;
        t.name = name;
        t.symbol = symbol;
        t.treasury = address(this);
        t.memo = "spike";
        t.tokenKeys = keys;
        t.expiry = IHederaTokenService.Expiry({second: 0, autoRenewAccount: address(this), autoRenewPeriod: 7776000});
        emit ValueSeen(msg.value);
        uint256 before = address(this).balance;
        (int64 rc, address tokenAddress) = HTS.createFungibleToken{value: msg.value}(t, initialSupply, 8);
        require(rc == SUCCESS, "create failed");
        token = tokenAddress;
        emit TokenCreated(tokenAddress, rc, before, address(this).balance);
    }

    function mintTo(address to, int64 amount) external {
        (int64 rc,,) = HTS.mintToken(token, amount, new bytes[](0));
        require(rc == SUCCESS, "mint failed");
        rc = HTS.transferToken(token, address(this), to, amount);
        require(rc == SUCCESS, "transfer failed");
    }

    function transferTo(address to, int64 amount) external {
        int64 rc = HTS.transferToken(token, address(this), to, amount);
        require(rc == SUCCESS, "transfer failed");
    }

    function mintOnly(int64 amount) external {
        (int64 rc,,) = HTS.mintToken(token, amount, new bytes[](0));
        require(rc == SUCCESS, "mint failed");
    }

    function wipeFrom(address holder, int64 amount) external {
        int64 rc = IHtsWipe(address(0x167)).wipeTokenAccount(token, holder, amount);
        emit Wiped(holder, amount, rc);
        require(rc == SUCCESS, "wipe failed");
    }

    function stake() external payable {
        emit ValueSeen(msg.value);
    }

    uint256 public hops;

    /// Scheduled target that schedules its own next hop, to prove a scheduled call can reschedule.
    function hop(uint256 remaining, uint256 delay, uint256 gasLimit) external {
        require(msg.sender == address(this) || msg.sender == tx.origin, "caller");
        ++hops;
        if (remaining == 0) return;
        uint256 expiry = block.timestamp + delay;
        (int64 rc, address schedule) = HSS.scheduleCall(
            address(this), expiry, gasLimit, 0, abi.encodeCall(this.hop, (remaining - 1, delay, gasLimit))
        );
        emit Rescheduled(schedule, rc, expiry, address(this).balance);
    }

    function capacity(uint256[] calldata offsets, uint256 gasLimit) external view returns (bool[] memory ok) {
        ok = new bool[](offsets.length);
        for (uint256 i; i < offsets.length; ++i) {
            ok[i] = HSS.hasScheduleCapacity(block.timestamp + offsets[i], gasLimit);
        }
    }

    function scheduleSettle(uint256 delay, uint256 gasLimit, address feed, uint256 pivot) external {
        uint256 expiry = block.timestamp + delay;
        (int64 rc, address schedule) =
            HSS.scheduleCall(address(this), expiry, gasLimit, 0, abi.encodeCall(this.onScheduled, (feed, pivot)));
        require(rc == SUCCESS, "schedule failed");
        lastSchedule = schedule;
        scheduledFor = expiry;
        emit Scheduled(schedule, rc, expiry);
    }

    function onScheduled(address feed, uint256 pivot) external {
        require(msg.sender == address(this) || msg.sender == tx.origin, "caller");
        (uint80 roundId, int256 answer, uint256 updatedAt, uint256 steps) = firstRoundAtOrAfter(feed, pivot);
        executedAt = block.timestamp;
        settledAnswer = answer;
        settledUpdatedAt = updatedAt;
        settledRound = roundId;
        walkSteps = steps;
        emit Executed(block.timestamp, answer, updatedAt, roundId, steps);
    }

    /// Walks back from the latest round until the previous round is older than `pivot`.
    /// Returns the first round whose updatedAt >= pivot (or reverts if latest is still older).
    function firstRoundAtOrAfter(address feed, uint256 pivot)
        public
        view
        returns (uint80 roundId, int256 answer, uint256 updatedAt, uint256 steps)
    {
        (roundId, answer,, updatedAt,) = IAggregatorV3(feed).latestRoundData();
        require(updatedAt >= pivot, "no round after pivot yet");
        while (steps < 48) {
            try IAggregatorV3(feed).getRoundData(roundId - 1) returns (
                uint80 prevId, int256 prevAnswer, uint256, uint256 prevUpdatedAt, uint80
            ) {
                if (prevUpdatedAt < pivot || prevUpdatedAt == 0) break;
                (roundId, answer, updatedAt) = (prevId, prevAnswer, prevUpdatedAt);
                ++steps;
            } catch {
                break;
            }
        }
    }
}
