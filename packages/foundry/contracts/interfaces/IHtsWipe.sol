// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice hedera-forking comments wipe out of its HTS interface, so we declare it here (selector-compatible).
interface IHtsWipe {
    /// @notice Wipes `amount` of `token` from `account`. Caller must hold the token wipe key.
    function wipeTokenAccount(address token, address account, int64 amount) external returns (int64 responseCode);
}
