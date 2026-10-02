// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IPyth } from "../../contracts/interfaces/IPyth.sol";

/// @notice Minimal Pyth stand-in honoring the publish-time window.
/// @dev Each updateData element is abi.encode(bytes32 id, int64 price, int32 expo, uint64 publishTime).
///      Selectors and structs match IPyth.
// forge-lint: disable-next-line(locked-ether)
contract MockPyth {
    /// @notice Thrown when no update matches an id inside the publish-time window.
    error PriceUnavailable(bytes32 priceId);

    /// @notice Fee charged per update element, in tinybar.
    uint256 public feePerUpdate = 1000;

    /// @notice Sets the fee charged per update element.
    function setFeePerUpdate(uint256 fee) external {
        feePerUpdate = fee;
    }

    /// @notice Returns the update fee for `updateData`.
    function getUpdateFee(bytes[] memory updateData) external view returns (uint256 feeAmount) {
        return feePerUpdate * updateData.length;
    }

    /// @notice Parses updates, keeping the first update per id inside [minPublishTime, maxPublishTime].
    function parsePriceFeedUpdatesUnique(
        bytes[] calldata updateData,
        bytes32[] calldata priceIds,
        uint64 minPublishTime,
        uint64 maxPublishTime
    ) external payable returns (IPyth.PriceFeed[] memory priceFeeds) {
        priceFeeds = new IPyth.PriceFeed[](priceIds.length);
        bool missing = false;
        bytes32 missingId = bytes32(0);
        for (uint256 i = 0; i < priceIds.length; ++i) {
            (int64 price, int32 expo, uint64 publishTime, bool found) =
                _findUpdate(updateData, priceIds[i], minPublishTime, maxPublishTime);
            if (found) {
                IPyth.Price memory parsed = IPyth.Price({ price: price, conf: 0, expo: expo, publishTime: publishTime });
                priceFeeds[i] = IPyth.PriceFeed({ id: priceIds[i], price: parsed, emaPrice: parsed });
            } else if (!missing) {
                missing = true;
                missingId = priceIds[i];
            }
        }
        if (missing) revert PriceUnavailable(missingId);
    }

    /// @notice Returns the first update matching `priceId` inside the publish-time window.
    function _findUpdate(bytes[] calldata updateData, bytes32 priceId, uint64 minPublishTime, uint64 maxPublishTime)
        internal
        pure
        returns (int64 price, int32 expo, uint64 publishTime, bool found)
    {
        for (uint256 j = 0; j < updateData.length; ++j) {
            (bytes32 id, int64 parsedPrice, int32 parsedExpo, uint64 parsedTime) =
                abi.decode(updateData[j], (bytes32, int64, int32, uint64));
            if (id == priceId && parsedTime >= minPublishTime && parsedTime <= maxPublishTime) {
                // forge-lint: disable-next-line(boolean-cst)
                return (parsedPrice, parsedExpo, parsedTime, true);
            }
        }
        // forge-lint: disable-next-line(boolean-cst)
        return (0, 0, 0, false);
    }
}
