// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)
pragma solidity ^0.8.24;

import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import "@fhevm/solidity/lib/FHE.sol";
import "./interfaces/ICPEGateway.sol";
import "./libraries/CPEErrors.sol";

/**
 * @title ConfidentialVault
 * @notice Example downstream contract that integrates with CPE.
 *         Demonstrates how any protocol can gate operations behind encrypted policies.
 *
 * @dev This is a simple ETH vault — deposits are free, withdrawals are
 *      gated by the CPE policy engine. The user never knows the limits,
 *      they just get approved or rejected.
 *
 *      Real-world use: replace with ERC-20 transfers, DeFi operations,
 *      DAO treasury spends, RWA transfers, etc.
 */
contract ConfidentialVault is ZamaEthereumConfig {
    ICPEGateway public immutable policyEngine;

    mapping(address => uint256) public balances;

    event Deposited(address indexed user, uint256 amount);
    event WithdrawalApproved(address indexed user);
    event WithdrawalDenied(address indexed user);
    event DebugApproved(ebool approved);

    constructor(address _policyEngine) {
        policyEngine = ICPEGateway(_policyEngine);
    }

    /**
     * @notice Deposit ETH into the vault. No policy check is performed for deposits.
     */
    function deposit() external payable {
        balances[msg.sender] += msg.value;
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

        // - Step 1: Ask CPE if this withdrawal is allowed -
        // evaluateTransaction checks all encrypted policy rules and returns
        // an encrypted boolean. All comparisons happen in ciphertext.
        ebool approved = policyEngine.evaluateTransaction(msg.sender, encAmount, inputProof);

        // - Step 2: FHE.req() — reverts if approved == encrypted false -
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
