// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal Chainlink AggregatorV3 interface used for settlement price discovery.
interface IAggregatorV3 {
    /// @notice Feed decimals (8 on the Hedera testnet feeds).
    function decimals() external view returns (uint8);

    /// @notice Latest round. Round id encodes (phaseId << 64) | aggregatorRoundId.
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);

    /// @notice Historical round data. Reverts for unknown round ids.
    function getRoundData(uint80 roundId)
        external
        view
        returns (uint80 rId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}
