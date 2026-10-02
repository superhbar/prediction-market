// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Programmable Chainlink AggregatorV3 stand-in with phase-aware round ids.
contract MockAggregator {
    /// @notice Thrown when reading an unknown round.
    error UnknownRound(uint80 roundId);

    /// @notice Stored round data.
    struct Round {
        int256 answer;
        uint256 updatedAt;
        bool exists;
    }

    /// @notice Feed decimals, 8 like the Hedera testnet feeds.
    uint8 public decimalsValue = 8;
    /// @notice Current phase id and aggregator round within the phase.
    uint16 private _phase = 1;
    /// @notice Aggregator round counter within the current phase.
    uint64 private _agg;
    /// @notice Rounds by id, plus the reported id override for boundary tests.
    mapping(uint80 => Round) private _rounds;
    /// @notice Reported id override per queried id for phase-jump emulation.
    mapping(uint80 => uint80) private _reportedId;
    /// @notice Whether a queried id uses its reported id override.
    mapping(uint80 => bool) private _spoofed;
    /// @notice Latest round id, zero when no rounds exist.
    uint80 public latestId;

    /// @notice Sets the feed decimals.
    function setDecimals(uint8 value) external {
        decimalsValue = value;
    }

    /// @notice Returns the feed decimals.
    function decimals() external view returns (uint8) {
        return decimalsValue;
    }

    /// @notice Appends a round in the current phase. The id is available via latestId.
    function addRound(int256 answer, uint256 updatedAt) external {
        _agg += 1;
        // forge-lint: disable-next-line(unsafe-typecast)
        uint80 roundId = (uint80(_phase) << 64) | _agg;
        _rounds[roundId] = Round({ answer: answer, updatedAt: updatedAt, exists: true });
        latestId = roundId;
    }

    /// @notice Stores a round under an explicit id for phase-boundary tests.
    function addRoundWithId(uint80 roundId, int256 answer, uint256 updatedAt) external {
        _rounds[roundId] = Round({ answer: answer, updatedAt: updatedAt, exists: true });
        latestId = roundId;
    }

    /// @notice Stores a round whose reported id differs from the queried id, emulating a phase jump.
    /// @dev Never moves latestId; the caller controls recency with addRoundWithId ordering.
    function addRoundSpoofed(uint80 queryId, uint80 reportedId, int256 answer, uint256 updatedAt) external {
        _rounds[queryId] = Round({ answer: answer, updatedAt: updatedAt, exists: true });
        _reportedId[queryId] = reportedId;
        _spoofed[queryId] = true;
    }

    /// @notice Starts a new phase; subsequent rounds restart at aggregator round 1.
    function nextPhase() external {
        _phase += 1;
        _agg = 0;
    }

    /// @notice Returns the latest round, or zeros when no rounds exist.
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        if (latestId == 0) return (0, 0, 0, 0, 0);
        return getRoundData(latestId);
    }

    /// @notice Returns a stored round, reverting on unknown ids.
    function getRoundData(uint80 roundId)
        public
        view
        returns (uint80 rId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        Round memory r = _rounds[roundId];
        if (!r.exists) revert UnknownRound(roundId);
        uint80 reported = _spoofed[roundId] ? _reportedId[roundId] : roundId;
        return (reported, r.answer, r.updatedAt, r.updatedAt, reported);
    }
}
