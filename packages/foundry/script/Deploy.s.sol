//SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ScaffoldETHDeploy } from "./DeployHelpers.s.sol";
import { Config, Feed, PredictionMarkets } from "../contracts/PredictionMarkets.sol";
import { HelperConfig } from "./HelperConfig.s.sol";

/**
 * @notice Main deployment script for all contracts
 * @dev Deploys PredictionMarkets with the HelperConfig feeds and config. Creates no markets:
 *      forge script cannot simulate the HTS and HSS precompiles, so markets are created on-chain
 *      after deployment.
 *
 * Example: yarn deploy # runs this script(without `--file` flag)
 */
contract DeployScript is ScaffoldETHDeploy, HelperConfig {
    function run() external ScaffoldEthDeployerRunner {
        (bytes32[] memory feedKeys, Feed[] memory feeds, address pyth, Config memory cfg) = getConfig();
        PredictionMarkets markets = new PredictionMarkets(feedKeys, feeds, pyth, cfg);
        deployments.push(Deployment({ name: "PredictionMarkets", addr: address(markets) }));
    }

    /// @notice ABI-encoded constructor arguments for the current chain id. Used by scripts-js/deployHedera.js,
    ///         which deploys with `cast send --create` because `forge script` cannot broadcast through Hashio.
    function constructorArgs() external view returns (bytes memory) {
        (bytes32[] memory feedKeys, Feed[] memory feeds, address pyth, Config memory cfg) = getConfig();
        return abi.encode(feedKeys, feeds, pyth, cfg);
    }
}
