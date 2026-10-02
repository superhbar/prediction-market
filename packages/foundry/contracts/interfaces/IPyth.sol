// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal interface for the Pyth price oracle contract on Hedera (same address testnet and mainnet).
/// @dev Declared locally on purpose; Pyth is an optional fallback so we do not add its SDK as a dependency.
interface IPyth {
    struct Price {
        int64 price;
        uint64 conf;
        int32 expo;
        uint256 publishTime;
    }

    struct PriceFeed {
        bytes32 id;
        Price price;
        Price emaPrice;
    }

    /// @notice Fee in tinybar required to parse `updateData`.
    function getUpdateFee(bytes[] memory updateData) external view returns (uint256 feeAmount);

    /// @notice Parses price updates, keeping only the single unique update per id in [minPublishTime, maxPublishTime].
    function parsePriceFeedUpdatesUnique(
        bytes[] calldata updateData,
        bytes32[] calldata priceIds,
        uint64 minPublishTime,
        uint64 maxPublishTime
    ) external payable returns (PriceFeed[] memory priceFeeds);
}
