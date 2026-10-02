// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IHSS {
    function scheduleCall(address to, uint256 expirySecond, uint256 gasLimit, uint64 value, bytes memory callData)
        external
        returns (int64 responseCode, address scheduleAddress);
}

/// Records msg.sender, tx.origin and address(this) as seen inside a HIP-1215 scheduled call.
contract WhoAmI {
    address public seenSender;
    address public seenOrigin;
    address public seenThis;

    receive() external payable {}

    function book(uint256 delay) external {
        (int64 rc,) = IHSS(address(0x16b)).scheduleCall(
            address(this), block.timestamp + delay, 400_000, 0, abi.encodeCall(this.record, ())
        );
        require(rc == 22, "schedule failed");
    }

    function record() external {
        seenSender = msg.sender;
        seenOrigin = tx.origin;
        seenThis = address(this);
    }
}
