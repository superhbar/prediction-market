// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Config, Feed } from "../contracts/PredictionMarkets.sol";

/// @notice Network configuration for PredictionMarkets deployments.
/// @dev Chain ids 296 (testnet) and 295 (mainnet). Mainnet oracle addresses are unaudited and educational.
/// @notice Network feeds and timing config, inherited by the deploy script so nothing extra is deployed.
abstract contract HelperConfig {
    /// @notice Thrown when the chain id is neither Hedera testnet nor mainnet.
    error InvalidChainId(uint256 chainId);

    /// @notice Testnet Chainlink HBAR/USD feed.
    address private constant TESTNET_HBAR_FEED = 0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a;
    /// @notice Testnet Chainlink BTC/USD feed.
    address private constant TESTNET_BTC_FEED = 0x058fE79CB5775d4b167920Ca6036B824805A9ABd;
    /// @notice Testnet Chainlink ETH/USD feed.
    address private constant TESTNET_ETH_FEED = 0xb9d461e0b962aF219866aDfA7DD19C52bB9871b9;
    /// @notice Mainnet Chainlink HBAR/USD feed (unaudited, educational).
    address private constant MAINNET_HBAR_FEED = 0xAF685FB45C12b92b5054ccb9313e135525F9b5d5;
    /// @notice Mainnet Chainlink BTC/USD feed (unaudited, educational).
    address private constant MAINNET_BTC_FEED = 0xaD01E27668658Cc8c1Ce6Ed31503D75F31eEf480;
    /// @notice Mainnet Chainlink ETH/USD feed (unaudited, educational).
    address private constant MAINNET_ETH_FEED = 0xd2D2CB0AEb29472C3008E291355757AD6225019e;
    /// @notice Feed key for HBAR/USD.
    bytes32 private constant HBAR_KEY = "HBAR/USD";
    /// @notice Feed key for BTC/USD.
    bytes32 private constant BTC_KEY = "BTC/USD";
    /// @notice Feed key for ETH/USD.
    bytes32 private constant ETH_KEY = "ETH/USD";
    /// @notice Pyth contract address, identical on testnet and mainnet.
    address private constant PYTH = 0xA2aa501b19aff244D90cc15a4Cf739D2725B5729;
    /// @notice Pyth HBAR/USD price id.
    bytes32 private constant PYTH_HBAR_ID = 0x3728e591097635310e6341af53db8b7ee42da9b3a8d918f9463ce9cca886dfbd;
    /// @notice Pyth BTC/USD price id.
    bytes32 private constant PYTH_BTC_ID = 0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43;
    /// @notice Pyth ETH/USD price id.
    bytes32 private constant PYTH_ETH_ID = 0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace;

    /// @notice Returns the feed keys, feeds, Pyth address and config for the current chain.
    /// @return feedKeys Feed keys in order: HBAR/USD, BTC/USD, ETH/USD.
    /// @return feeds Oracle feeds parallel to `feedKeys`.
    /// @return pyth Pyth oracle contract address.
    /// @return cfg Market timing and reserve configuration.
    function getConfig()
        public
        view
        returns (bytes32[] memory feedKeys, Feed[] memory feeds, address pyth, Config memory cfg)
    {
        if (block.chainid == 296) {
            return
                (
                    buildFeedKeys(),
                    buildFeeds(TESTNET_HBAR_FEED, TESTNET_BTC_FEED, TESTNET_ETH_FEED),
                    PYTH,
                    buildConfig()
                );
        }
        if (block.chainid == 295) {
            return
                (
                    buildFeedKeys(),
                    buildFeeds(MAINNET_HBAR_FEED, MAINNET_BTC_FEED, MAINNET_ETH_FEED),
                    PYTH,
                    buildConfig()
                );
        }
        revert InvalidChainId(block.chainid);
    }

    /// @notice Returns the ordered feed keys.
    function buildFeedKeys() public pure returns (bytes32[] memory feedKeys) {
        feedKeys = new bytes32[](3);
        feedKeys[0] = HBAR_KEY;
        feedKeys[1] = BTC_KEY;
        feedKeys[2] = ETH_KEY;
    }

    /// @notice Returns the feeds for the given Chainlink addresses with the shared Pyth ids.
    function buildFeeds(address hbarFeed, address btcFeed, address ethFeed) public pure returns (Feed[] memory feeds) {
        feeds = new Feed[](3);
        feeds[0] = Feed({ chainlink: hbarFeed, pythId: PYTH_HBAR_ID });
        feeds[1] = Feed({ chainlink: btcFeed, pythId: PYTH_BTC_ID });
        feeds[2] = Feed({ chainlink: ethFeed, pythId: PYTH_ETH_ID });
    }

    /// @notice Returns the default timing and reserve configuration.
    function buildConfig() public pure returns (Config memory cfg) {
        cfg = Config({
            // Testnet Chainlink feeds can go quiet for hours, so the scheduled path keeps checking across the
            // whole maxRoundLag window: +10, +40, +70, +100 and +130 minutes after expiry. The last check
            // still accepts a round published up to 2 hours after expiry.
            settlementDelay: 10 minutes,
            retryDelay: 30 minutes,
            maxRetries: 4,
            maxRoundLag: 2 hours,
            gracePeriod: 24 hours,
            minDuration: 5 minutes,
            maxDuration: 60 days,
            // 4 retries x 1.5 HBAR plus 5 scheduled executions x 0.5 HBAR.
            minReserve: 8.5e8,
            retryCostEstimate: 1.5e8
        });
    }
}
