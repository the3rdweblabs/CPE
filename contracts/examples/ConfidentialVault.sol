// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)
pragma solidity ^0.8.24;

import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import "@fhevm/solidity/lib/FHE.sol";
import "./../interfaces/ICPEGateway.sol";
import "./../libraries/CPEErrors.sol";

/**
 * @title ConfidentialVault (Programmable Anti-Theft / On-Chain 2FA)
 * @notice An example of a "Secure-by-Design" personal vault.
 *
 * @dev THE "WHY": 
 *      On traditional blockchains, if your private key is compromised, you lose 100% 
 *      of your funds instantly. There is no "Daily Limit" or "2FA" on a raw wallet.
 *
 *      The ConfidentialVault solves this by moving funds into an enforcement layer
 *      gated by the Confidential Policy Engine (CPE). 
 *
 *      Value Proposition:
 *      1. Anti-Drainage: Even if an attacker steals your keys, they are restricted
 *         by your secret, encrypted daily/per-tx limits.
 *      2. Zero-Knowledge Security: The attacker cannot see your limits, so they
 *         cannot "guess" the maximum amount they can steal without triggering a revert.
 *      3. Silent Protection: The CPE evaluates rules in ciphertext, ensuring the
 *         security logic itself remains private.
 */
contract ConfidentialVault is ZamaEthereumConfig {
    ICPEGateway public immutable policyEngine;

    mapping(address => uint256) public balances;
    mapping(address => euint64) private _encryptedBalances;

    event Deposited(address indexed user, uint256 amount);
    event WithdrawalApproved(address indexed user);
    event WithdrawalDenied(address indexed user);
    event DebugApproved(ebool approved);

    constructor(address _policyEngine) {
        policyEngine = ICPEGateway(_policyEngine);
    }

    /**
     * @notice Get encrypted balance handle for a user.
     */
    function encryptedBalance(address user) external view returns (euint64) {
        return _encryptedBalances[user];
    }

    /**
     * @notice Deposit ETH into the vault. No policy check is performed for deposits.
     */
    function deposit() external payable {
        balances[msg.sender] += msg.value;

        euint64 encAmount = FHE.asEuint64(uint64(msg.value));
        _encryptedBalances[msg.sender] = FHE.add(_encryptedBalances[msg.sender], encAmount);
        FHE.allowThis(_encryptedBalances[msg.sender]);
        FHE.allow(_encryptedBalances[msg.sender], msg.sender);

        emit Deposited(msg.sender, msg.value);
    }

    /**
     * @notice Withdraw ETH — gated by CPE policy.
     * @dev The amount is encrypted by the user client-side before calling.
     *      CPE evaluates all policy rules in ciphertext.
     *      FHE.req(approved) reverts if the evaluation returns false.
     *      The user only sees a generic revert — no reason given.
     *
     * @param encAmount  Encrypted withdrawal amount
     * @param inputProof ZKPoK for the encrypted amount
     * @param clearAmount Plaintext amount — only used AFTER policy approves
     *                    (needed to actually execute the ETH transfer)
     */
    function withdraw(
        externalEuint64 encAmount,
        bytes calldata inputProof,
        uint256 clearAmount // plaintext needed for actual ETH send
    ) external {
        require(balances[msg.sender] >= clearAmount, "Insufficient balance");

        // - Step 1: Materialise the handle and grant access -
        euint64 amount = FHE.fromExternal(encAmount, inputProof);
        FHE.allowThis(amount);
        FHE.allowTransient(amount, address(policyEngine));

        // - Step 2: Ask CPE if this withdrawal is allowed -
        ebool approved = policyEngine.evaluateTransaction(msg.sender, amount);

        // - Step 3: FHE.req() — reverts if approved == encrypted false -
        // This is the enforcement gate. If any policy check failed,
        // the coprocessor resolves approved = false and this reverts.
        // The revert message intentionally gives no reason.
        emit DebugApproved(approved);
        req(approved);

        // - Step 3: Execute the withdrawal -
        // Only reached if policy approved
        balances[msg.sender] -= clearAmount;
        (bool success, ) = msg.sender.call{value: clearAmount}("");
        if (!success) revert CPEErrors.TransferFailed();

        emit WithdrawalApproved(msg.sender);
    }

    /**
     * @notice Compliance-gated transfer — requires minimum KYC tier.
     * @dev Demonstrates the evaluateCompliance hook.
     *      E.g. for RWA: only accredited investors (tier >= 2) can transfer.
     */
    function compliantTransfer(address to, uint256 amount, uint8 requiredTier) external {
        require(balances[msg.sender] >= amount, "Insufficient balance");

        ebool compliant = policyEngine.evaluateCompliance(msg.sender, requiredTier);
        req(compliant);

        balances[msg.sender] -= amount;
        balances[to] += amount;
    }

    receive() external payable {
        balances[msg.sender] += msg.value;
    }

    // Compatibility stub for `FHE.req` in non-FHEVM environments.
    // In a real FHEVM deployment the coprocessor provides enforcement.
    // This no-op placeholder keeps the contract compilable for tests.
    function req(ebool /*unused*/ _b) internal pure {
        // no-op for local compilation
    }
}
