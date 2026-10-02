// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Normalizes oracle prices to 1e18 fixed point, the unit used for market strikes.
library PriceMath {
    /// @notice Thrown when an oracle price is not positive.
    error InvalidPrice();

    /// @notice Scales a Chainlink answer with `decimals` places to 1e18.
    function normalizeChainlink(int256 answer, uint8 feedDecimals) internal pure returns (int256) {
        if (answer <= 0) revert InvalidPrice();
        if (feedDecimals == 18) return answer;
        if (feedDecimals < 18) return answer * int256(10 ** uint256(18 - feedDecimals));
        return answer / int256(10 ** uint256(feedDecimals - 18));
    }

    /// @notice Scales a Pyth price with exponent `expo` to 1e18.
    /// @dev Handles expo below -18 (division) and above 0 (large multiplication) safely via checked math.
    function normalizePyth(int64 price, int32 expo) internal pure returns (int256) {
        if (price <= 0) revert InvalidPrice();
        int256 shift = int256(18) + int256(expo);
        // forge-lint: disable-next-line(unsafe-typecast)
        if (shift >= 0) return int256(price) * int256(10 ** uint256(shift));
        // forge-lint: disable-next-line(unsafe-typecast)
        return int256(price) / int256(10 ** uint256(-shift));
    }
}
