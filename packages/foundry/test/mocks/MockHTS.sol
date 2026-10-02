// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IHederaTokenService } from "hedera-forking/IHederaTokenService.sol";
import { Vm } from "forge-std/Vm.sol";

/// @notice Etched at 0x167 in unit tests to stand in for the HTS precompile.
/// @dev Emulates token creation fees with real balance effects: it keeps exactly `creationFee` and
///      leaves the rest with the caller via vm.deal, mirroring live behavior where unspent value
///      forwarded to createFungibleToken stays in the calling contract (which has no receive() for
///      a plain refund). Selectors match hedera-forking's IHederaTokenService plus IHtsWipe.
// forge-lint: disable-next-line(locked-ether)
contract MockHTS {
    /// @notice forge cheatcode entrypoint for balance surgery on the creation fee.
    Vm private constant VM = Vm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);
    /// @notice HTS SUCCESS response code.
    int64 private constant SUCCESS = 22;
    /// @notice Arbitrary non-SUCCESS response code used for failures.
    int64 private constant FAILURE = 200;

    /// @notice Fee consumed per token creation, in tinybar.
    uint256 public creationFee;
    /// @notice Token nonce for deterministic mock token addresses.
    uint256 private _nonce;
    /// @notice Treasury recorded per mock token.
    mapping(address => address) public treasuryOf;
    /// @notice Total supply per mock token.
    mapping(address => uint256) public totalSupplyOf;
    /// @notice Token balances per mock token and holder.
    mapping(address => mapping(address => uint256)) public balanceOf;
    /// @notice Disassociated recipients; transfers to them fail like the real precompile.
    mapping(address => mapping(address => bool)) public blocked;

    /// @notice Sets the fee consumed per token creation.
    function setCreationFee(uint256 fee) external {
        creationFee = fee;
    }

    /// @notice Blocks or unblocks a recipient, emulating token association.
    function setBlocked(address token, address account, bool value) external {
        blocked[token][account] = value;
    }

    /// @notice Creates a mock token, keeping `creationFee` and leaving the excess with the caller.
    function createFungibleToken(IHederaTokenService.HederaToken memory token, int64, int32)
        external
        payable
        returns (int64 responseCode, address tokenAddress)
    {
        if (msg.value < creationFee) return (FAILURE, address(0));
        uint256 excess = msg.value - creationFee;
        if (excess > 0) {
            VM.deal(msg.sender, msg.sender.balance + excess);
            VM.deal(address(this), address(this).balance - excess);
        }
        _nonce += 1;
        tokenAddress = address(uint160(uint256(keccak256(abi.encode("PM-MOCK-TOKEN", _nonce, block.chainid)))));
        treasuryOf[tokenAddress] = token.treasury;
        return (SUCCESS, tokenAddress);
    }

    /// @notice Mints `amount` to the token treasury.
    function mintToken(address token, int64 amount, bytes[] memory)
        external
        returns (int64 responseCode, int64 newTotalSupply, int64[] memory serialNumbers)
    {
        if (amount <= 0) return (FAILURE, 0, new int64[](0));
        // forge-lint: disable-next-line(unsafe-typecast)
        uint256 mintAmount = uint256(uint64(amount));
        totalSupplyOf[token] += mintAmount;
        balanceOf[token][treasuryOf[token]] += mintAmount;
        // forge-lint: disable-next-line(unsafe-typecast)
        return (SUCCESS, int64(uint64(totalSupplyOf[token])), new int64[](0));
    }

    /// @notice Moves `amount` from `sender` to `recipient`, failing on low balance or no association.
    function transferToken(address token, address sender, address recipient, int64 amount)
        external
        returns (int64 responseCode)
    {
        if (amount <= 0) return FAILURE;
        // forge-lint: disable-next-line(unsafe-typecast)
        uint256 transferAmount = uint256(uint64(amount));
        if (balanceOf[token][sender] < transferAmount) return FAILURE;
        if (blocked[token][recipient]) return FAILURE;
        balanceOf[token][sender] -= transferAmount;
        balanceOf[token][recipient] += transferAmount;
        return SUCCESS;
    }

    /// @notice Wipes `amount` from `account`, reducing total supply. No approval needed.
    function wipeTokenAccount(address token, address account, int64 amount) external returns (int64 responseCode) {
        if (amount <= 0) return FAILURE;
        // forge-lint: disable-next-line(unsafe-typecast)
        uint256 wipeAmount = uint256(uint64(amount));
        if (balanceOf[token][account] < wipeAmount) return FAILURE;
        balanceOf[token][account] -= wipeAmount;
        totalSupplyOf[token] -= wipeAmount;
        return SUCCESS;
    }
}
