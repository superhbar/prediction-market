// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal interface for the Hedera Schedule Service (HIP-1215) system contract at 0x16b.
interface IHederaScheduleService {
    /// @notice Schedules a call to `to` at `expirySecond` with `gasLimit` and `value`.
    function scheduleCall(address to, uint256 expirySecond, uint256 gasLimit, uint64 value, bytes calldata callData)
        external
        returns (int64 responseCode, address scheduleAddress);

    /// @notice Returns whether the network currently has capacity to schedule a call at `expirySecond`.
    function hasScheduleCapacity(uint256 expirySecond, uint256 gasLimit) external view returns (bool hasCapacity);
}
