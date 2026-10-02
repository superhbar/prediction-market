// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Etched at 0x16b in unit tests to stand in for the Hedera Schedule Service.
/// @dev Records every scheduleCall so tests can assert args; capacity and response code are configurable.
///      Selectors match IHederaScheduleService.
contract MockHSS {
    /// @notice HTS/HSS SUCCESS response code.
    int64 private constant SUCCESS = 22;

    /// @notice Recorded scheduleCall arguments.
    struct Call {
        address to;
        uint256 expiry;
        uint256 gasLimit;
        uint64 value;
        bytes callData;
        address schedule;
    }

    /// @notice Whether hasScheduleCapacity reports capacity.
    bool public capacity = true;
    /// @notice Response code returned by scheduleCall.
    int64 public responseCode = SUCCESS;
    /// @notice All recorded scheduleCall invocations.
    Call[] public calls;

    /// @notice Sets the hasScheduleCapacity answer.
    function setCapacity(bool value) external {
        capacity = value;
    }

    /// @notice Sets the scheduleCall response code.
    function setResponseCode(int64 rc) external {
        responseCode = rc;
    }

    /// @notice Returns the number of recorded scheduleCall invocations.
    function callCount() external view returns (uint256) {
        return calls.length;
    }

    /// @notice Returns the target, expiry and gas limit of a recorded call.
    function callArgs(uint256 i) external view returns (address to, uint256 expiry, uint256 gasLimit) {
        Call storage recorded = calls[i];
        return (recorded.to, recorded.expiry, recorded.gasLimit);
    }

    /// @notice Returns the schedule address of the latest recorded call.
    function lastSchedule() external view returns (address) {
        return calls[calls.length - 1].schedule;
    }

    /// @notice Records a scheduled call and returns a deterministic schedule address.
    function scheduleCall(address to, uint256 expirySecond, uint256 gasLimit, uint64 value, bytes calldata callData)
        external
        returns (int64 rc, address scheduleAddress)
    {
        scheduleAddress = address(uint160(uint256(keccak256(abi.encode("PM-MOCK-SCHEDULE", calls.length)))));
        calls.push(
            Call({
                to: to,
                expiry: expirySecond,
                gasLimit: gasLimit,
                value: value,
                callData: callData,
                schedule: scheduleAddress
            })
        );
        return (responseCode, scheduleAddress);
    }

    /// @notice Reports schedule capacity per test configuration.
    function hasScheduleCapacity(uint256, uint256) external view returns (bool hasCapacity) {
        return capacity;
    }
}
