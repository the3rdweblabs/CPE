// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)
pragma solidity ^0.8.24;

import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import "@fhevm/solidity/lib/FHE.sol";
import "./interfaces/IPolicyRegistry.sol";
import "./interfaces/IAuditLogger.sol";

/**
 * @title  ConfidentialPolicyEngine
 * @author @CYBWithFlourish (https://github.com/CYBWithFlourish)
 * @notice Core policy engine. Stores encrypted security rules per entity and
 *         evaluates them entirely in ciphertext - no rule is ever decrypted
 *         during evaluation. Enforcement is address-bound, not session-bound:
 *         the same wallet on MetaMask, Trust Wallet, or a raw CLI call hits
 *         the exact same policy.
 *
 * @dev    Inherits SepoliaZamaFHEVMConfig which wires the four FHEVM
 *         infrastructure contracts automatically:
 *           • FHEVMExecutor  - symbolic execution of FHE ops + coprocessor relay
 *           • ACL            - per-handle ciphertext permission registry
 *           • KMSVerifier    - verifies KMS-signed decryption callbacks
 *           • InputVerifier  - validates ZKPoK proofs on externalEuintXX inputs
 *
 *
 * CRITICAL FHEVM RULES enforced throughout this contract:
 *
 *  1. Every new FHE handle MUST call FHE.allowThis() immediately.
 *     Permissions do NOT transfer when a new handle is created from an op.
 *
 *  2. Use FHE.select(cond, a, b) - never branch on an ebool.
 *     You cannot write `if (ebool_value)`. The encrypted condition must stay
 *     in ciphertext all the way through FHE.select().
 *
 *  3. externalEuintXX inputs MUST be converted via FHE.asEuintXX() before
 *     any use. The external type carries the ZKPoK proof; conversion validates
 *     it and returns a usable internal handle.
 *
 *  4. Return values (ebool) passed to callers need FHE.allowTransient() so
 *     the receiving contract can read them within the same transaction.
 *
 */
contract ConfidentialPolicyEngine is ZamaEthereumConfig {
    // Compatibility helpers
    // Thin wrappers to keep the higher-level FHE.asE* calls consistent
    // across different @fhevm package versions.

    function asEuint64(externalEuint64 h, bytes calldata proof) internal returns (euint64) {
        return FHE.fromExternal(h, proof);
    }

    function asEuint64(uint256 v) internal returns (euint64) {
        return FHE.asEuint64(uint64(v));
    }

    function asEuint8(externalEuint8 h, bytes calldata proof) internal returns (euint8) {
        return FHE.fromExternal(h, proof);
    }

    function asEuint8(uint256 v) internal returns (euint8) {
        return FHE.asEuint8(uint8(v));
    }

    function asEbool(externalEbool h, bytes calldata proof) internal returns (ebool) {
        return FHE.fromExternal(h, proof);
    }

    function asEbool(bool v) internal returns (ebool) {
        return FHE.asEbool(v);
    }

    // Structs

    /**
     * @notice Confidential policy rules and metadata for a single entity.
     * @dev Encrypted fields are FHE handles; plaintext fields are metadata.
     */
    struct ConfidentialPolicy {
        // Financial controls (all encrypted)
        euint64 perTxLimit; // max amount allowed per single transaction
        euint64 dailyLimit; // absolute 24-hour outflow ceiling
        euint64 monthlyLimit; // absolute 30-day outflow ceiling
        euint64 dailyUsed; // rolling counter: resets at dailyResetAt
        euint64 monthlyUsed; // rolling counter: resets at monthlyResetAt
        // Access controls (all encrypted)
        euint8 riskTier; // 0–255 risk classification
        euint8 requiredSigners; // multisig threshold (0 = not required)
        ebool frozen; // silent freeze - blocks ALL transactions
        ebool requiresApproval; // manual gate - blocks until lifted
        // Compliance (encrypted)
        euint8 complianceTier; // KYC/AML level 0–255
        // Rolling window resets (plaintext - non-sensitive)
        uint256 dailyResetAt; // unix ts when dailyUsed next resets
        uint256 monthlyResetAt; // unix ts when monthlyUsed next resets
        // Administrative metadata (plaintext)
        address policyAdmin; // address authorised to mutate this policy
        address pendingAdmin; // set during 2-step admin handover
        bool exists; // guard: true once createPolicy() completes
        uint256 createdAt;
        uint256 updatedAt;
    }

    // State

    /// @dev policyId → ConfidentialPolicy
    mapping(bytes32 => ConfidentialPolicy) private _policies;

    /// @dev wallet address → policyId (one active policy per address)
    mapping(address => bytes32) private _addressPolicy;

    /// @dev policyId → auditor address → authorised
    mapping(bytes32 => mapping(address => bool)) private _auditors;

    /// @dev contracts allowed to call evaluateTransaction()
    mapping(address => bool) private _authorizedCallers;

    /// @dev deployer / engine owner
    address public owner;

    /// @dev on-chain policy registry and audit logger addresses
    address public policyRegistry;
    address public auditLogger;

    // Custom errors

    error NotOwner();
    error NotPolicyAdmin();
    error NotPendingAdmin();
    error PolicyNotFound();
    error PolicyAlreadyExists();
    error UnauthorizedCaller();
    error NoPolicyBound();
    error ZeroAddress();

    // Events

    event PolicyCreated(bytes32 indexed policyId, address indexed admin, uint256 ts);
    event PolicyUpdated(bytes32 indexed policyId, string field, uint256 ts);
    event PolicyFrozen(bytes32 indexed policyId, uint256 ts);
    event PolicyUnfrozen(bytes32 indexed policyId, uint256 ts);
    event AddressBound(bytes32 indexed policyId, address indexed subject, uint256 ts);
    event AddressUnbound(bytes32 indexed policyId, address indexed subject, uint256 ts);
    event PolicyEvaluated(bytes32 indexed policyId, address indexed subject, uint256 ts);
    event AuditorGranted(bytes32 indexed policyId, address indexed auditor);
    event AuditorRevoked(bytes32 indexed policyId, address indexed auditor);
    event CallerAuthorized(address indexed caller);
    event CallerRevoked(address indexed caller);
    event AdminTransferInitiated(bytes32 indexed policyId, address indexed newAdmin);
    event AdminTransferAccepted(bytes32 indexed policyId, address indexed newAdmin);

    // Modifiers

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyPolicyAdmin(bytes32 policyId) {
        if (_policies[policyId].policyAdmin != msg.sender) revert NotPolicyAdmin();
        _;
    }

    modifier policyExists(bytes32 policyId) {
        if (!_policies[policyId].exists) revert PolicyNotFound();
        _;
    }

    modifier onlyAuthorizedCaller() {
        if (!_authorizedCallers[msg.sender] && msg.sender != owner) {
            revert UnauthorizedCaller();
        }
        _;
    }

    // Constructor

    /**
     * @notice SepoliaZamaFHEVMConfig constructor runs first, registering all
     *         Zama infrastructure addresses (Executor, ACL, KMSVerifier,
     *         InputVerifier) for the Sepolia deployment.
     *         No constructor arguments needed - addresses are baked into the
     *         config contract.
     */
    constructor() {
        owner = msg.sender;
    }

    // Policy lifecycle

    /**
     * @notice Create a new confidential policy for an entity.
     * @dev All encrypted inputs must include a ZK proof and be converted
     *      to internal handles via `asE*`. Callers must grant ACL rights
     *      to this contract using `FHE.allowThis()` for each new handle.
     * @param policyId keccak256 identifier chosen by admin
     */
    function createPolicy(
        bytes32 policyId,
        externalEuint64 encPerTxLimit,
        externalEuint64 encDailyLimit,
        externalEuint64 encMonthlyLimit,
        externalEuint8 encRiskTier,
        externalEuint8 encComplianceTier,
        bytes calldata inputProof
    ) external {
        if (_policies[policyId].exists) revert PolicyAlreadyExists();

        // Convert external inputs to internal handles (validates ZKPoK)
        euint64 perTxLimit = asEuint64(encPerTxLimit, inputProof);
        euint64 dailyLimit = asEuint64(encDailyLimit, inputProof);
        euint64 monthlyLimit = asEuint64(encMonthlyLimit, inputProof);
        euint8 riskTier = asEuint8(encRiskTier, inputProof);
        euint8 complianceTier = asEuint8(encComplianceTier, inputProof);

        // Initialise boolean flags as encrypted false
        ebool frozen = asEbool(false);
        ebool requiresApproval = asEbool(false);

        // Initialise rolling counters at encrypted zero
        euint64 dailyUsed = asEuint64(0);
        euint64 monthlyUsed = asEuint64(0);

        // Stub requiredSigners at 1 (updateable separately)
        euint8 requiredSigners = asEuint8(1);

        // ACL: grant this contract compute rights on every new handle.
        // Every new handle requires `FHE.allowThis()`.
        FHE.allowThis(perTxLimit);
        FHE.allowThis(dailyLimit);
        FHE.allowThis(monthlyLimit);
        FHE.allowThis(riskTier);
        FHE.allowThis(complianceTier);
        FHE.allowThis(frozen);
        FHE.allowThis(requiresApproval);
        FHE.allowThis(dailyUsed);
        FHE.allowThis(monthlyUsed);
        FHE.allowThis(requiredSigners);

        // Grant admin read access for off-chain KMS auditing
        FHE.allow(perTxLimit, msg.sender);
        FHE.allow(dailyLimit, msg.sender);
        FHE.allow(monthlyLimit, msg.sender);
        FHE.allow(riskTier, msg.sender);
        FHE.allow(complianceTier, msg.sender);

        // Persist policy
        _policies[policyId] = ConfidentialPolicy({
            perTxLimit: perTxLimit,
            dailyLimit: dailyLimit,
            monthlyLimit: monthlyLimit,
            dailyUsed: dailyUsed,
            monthlyUsed: monthlyUsed,
            riskTier: riskTier,
            requiredSigners: requiredSigners,
            frozen: frozen,
            requiresApproval: requiresApproval,
            complianceTier: complianceTier,
            dailyResetAt: block.timestamp + 1 days,
            monthlyResetAt: block.timestamp + 30 days,
            policyAdmin: msg.sender,
            pendingAdmin: address(0),
            exists: true,
            createdAt: block.timestamp,
            updatedAt: block.timestamp
        });

        emit PolicyCreated(policyId, msg.sender, block.timestamp);
        if (auditLogger != address(0)) {
            IAuditLogger(auditLogger).logEvent(policyId, address(0), 3); // 3 = POLICY_CREATED
        }
    }

    // Policy updates

    /**
     * @notice Replace the per-transaction limit with a new encrypted value.
     *
     * @dev    Old handle is abandoned (it remains in the coprocessors but
     *         no contract points to it). A brand-new handle is produced by
     *         FHE.asEuint64() and ACL grants must be re-applied to it.
     *         This is intentional: updating a policy limit is indistinguishable
     *         from any other state write - no signal to on-chain observers.
     */
    function updatePerTxLimit(
        bytes32 policyId,
        externalEuint64 encNewLimit,
        bytes calldata inputProof
    ) external onlyPolicyAdmin(policyId) policyExists(policyId) {
        euint64 newLimit = asEuint64(encNewLimit, inputProof);
        FHE.allowThis(newLimit);
        FHE.allow(newLimit, msg.sender);

        _policies[policyId].perTxLimit = newLimit;
        _policies[policyId].updatedAt = block.timestamp;

        emit PolicyUpdated(policyId, "perTxLimit", block.timestamp);
    }

    /**
     * @notice Replace the daily outflow limit.
     */
    function updateDailyLimit(
        bytes32 policyId,
        externalEuint64 encNewLimit,
        bytes calldata inputProof
    ) external onlyPolicyAdmin(policyId) policyExists(policyId) {
        euint64 newLimit = asEuint64(encNewLimit, inputProof);
        FHE.allowThis(newLimit);
        FHE.allow(newLimit, msg.sender);

        _policies[policyId].dailyLimit = newLimit;
        _policies[policyId].updatedAt = block.timestamp;

        emit PolicyUpdated(policyId, "dailyLimit", block.timestamp);
    }

    /**
     * @notice Replace the monthly outflow limit.
     */
    function updateMonthlyLimit(
        bytes32 policyId,
        externalEuint64 encNewLimit,
        bytes calldata inputProof
    ) external onlyPolicyAdmin(policyId) policyExists(policyId) {
        euint64 newLimit = asEuint64(encNewLimit, inputProof);
        FHE.allowThis(newLimit);
        FHE.allow(newLimit, msg.sender);

        _policies[policyId].monthlyLimit = newLimit;
        _policies[policyId].updatedAt = block.timestamp;

        emit PolicyUpdated(policyId, "monthlyLimit", block.timestamp);
    }

    /**
     * @notice Replace the risk tier.
     */
    function updateRiskTier(
        bytes32 policyId,
        externalEuint8 encNewTier,
        bytes calldata inputProof
    ) external onlyPolicyAdmin(policyId) policyExists(policyId) {
        euint8 newTier = asEuint8(encNewTier, inputProof);
        FHE.allowThis(newTier);
        FHE.allow(newTier, msg.sender);

        _policies[policyId].riskTier = newTier;
        _policies[policyId].updatedAt = block.timestamp;

        emit PolicyUpdated(policyId, "riskTier", block.timestamp);
    }

    /**
     * @notice Replace the compliance tier.
     */
    function updateComplianceTier(
        bytes32 policyId,
        externalEuint8 encNewTier,
        bytes calldata inputProof
    ) external onlyPolicyAdmin(policyId) policyExists(policyId) {
        euint8 newTier = asEuint8(encNewTier, inputProof);
        FHE.allowThis(newTier);
        FHE.allow(newTier, msg.sender);

        _policies[policyId].complianceTier = newTier;
        _policies[policyId].updatedAt = block.timestamp;

        emit PolicyUpdated(policyId, "complianceTier", block.timestamp);
    }

    /**
     * @notice Set or clear the requiresApproval gate.
     *
     * @dev    Admin passes an encrypted bool rather than a plaintext flag.
     *         This prevents an on-chain observer from seeing a "gate opened"
     *         signal - the write is ciphertext regardless of direction.
     */
    function setRequiresApproval(
        bytes32 policyId,
        externalEbool encFlag,
        bytes calldata inputProof
    ) external onlyPolicyAdmin(policyId) policyExists(policyId) {
        ebool flag = asEbool(encFlag, inputProof);
        FHE.allowThis(flag);

        _policies[policyId].requiresApproval = flag;
        _policies[policyId].updatedAt = block.timestamp;

        emit PolicyUpdated(policyId, "requiresApproval", block.timestamp);
    }

    /**
     * @notice Update the multisig threshold.
     */
    function updateRequiredSigners(
        bytes32 policyId,
        externalEuint8 encSigners,
        bytes calldata inputProof
    ) external onlyPolicyAdmin(policyId) policyExists(policyId) {
        euint8 signers = asEuint8(encSigners, inputProof);
        FHE.allowThis(signers);
        FHE.allow(signers, msg.sender);

        _policies[policyId].requiredSigners = signers;
        _policies[policyId].updatedAt = block.timestamp;

        emit PolicyUpdated(policyId, "requiredSigners", block.timestamp);
    }

    // Freeze / unfreeze

    /**
     * @notice Silently freeze a policy. All subsequent transactions will be denied.
     * @dev The freeze is stored as an encrypted boolean; the write reveals no
     *      plaintext meaning on-chain.
     */
    function freezePolicy(bytes32 policyId) external onlyPolicyAdmin(policyId) policyExists(policyId) {
        ebool frozen = asEbool(true);
        FHE.allowThis(frozen); // contract must be able to read it during eval

        _policies[policyId].frozen = frozen;
        _policies[policyId].updatedAt = block.timestamp;

        emit PolicyFrozen(policyId, block.timestamp);
        if (auditLogger != address(0)) {
            IAuditLogger(auditLogger).logEvent(policyId, address(0), 1); // 1 = FREEZE
        }
    }

    /**
     * @notice Unfreeze a policy - restore normal transaction flow.
     *
     * @dev    Writes FHE.asEbool(false). Evaluation will compute:
     *           FHE.not(frozen) → ebool(true) → passes the frozen check.
     */
    function unfreezePolicy(bytes32 policyId) external onlyPolicyAdmin(policyId) policyExists(policyId) {
        ebool notFrozen = asEbool(false);
        FHE.allowThis(notFrozen);

        _policies[policyId].frozen = notFrozen;
        _policies[policyId].updatedAt = block.timestamp;

        emit PolicyUnfrozen(policyId, block.timestamp);
        if (auditLogger != address(0)) {
            IAuditLogger(auditLogger).logEvent(policyId, address(0), 2); // 2 = UNFREEZE
        }
    }

    // Address binding

    /**
     * @notice Bind a wallet address to a policy.
     *
     * @dev    This is the mechanism that makes enforcement address-bound rather
     *         than session-bound. Once bound:
     *           • MetaMask showing 0xABC → same policy
     *           • Trust Wallet showing 0xABC → same policy
     *           • Etherscan direct call from 0xABC → same policy
     *           • CLI cast call from 0xABC → same policy
     *
     *         Binding replaces any existing binding silently (no unbind
     *         required first). Admin can manage multiple wallets under one
     *         policy (e.g. all traders at a fund share one encrypted ruleset).
     */
    function bindAddress(bytes32 policyId, address subject) external onlyPolicyAdmin(policyId) policyExists(policyId) {
        _addressPolicy[subject] = policyId;
        if (policyRegistry != address(0)) {
            IPolicyRegistry(policyRegistry).bindAddress(policyId, subject);
        }
        emit AddressBound(policyId, subject, block.timestamp);
    }

    /**
     * @notice Remove a wallet's policy binding.
     *
     * @dev    Unbound addresses have no policy - evaluateTransaction() returns
     *         encrypted false for them (default deny).
     */
    function unbindAddress(address subject) external {
        bytes32 policyId = _addressPolicy[subject];
        if (policyId == bytes32(0)) revert NoPolicyBound();
        if (_policies[policyId].policyAdmin != msg.sender) revert NotPolicyAdmin();

        delete _addressPolicy[subject];
        if (policyRegistry != address(0)) {
            IPolicyRegistry(policyRegistry).unbindAddress(subject);
        }
        emit AddressUnbound(policyId, subject, block.timestamp);
    }

    // Core evaluation

    /**
     * @notice Evaluate whether a transaction is permitted under a subject's
     *         encrypted policy. All checks are performed on encrypted handles.
     * @param subject Wallet address whose policy is evaluated
     * @param amount  Materialised encrypted amount
     * @return approved Encrypted boolean - true only if all checks pass
     */
    function evaluateTransaction(
        address subject,
        euint64 amount
    ) external onlyAuthorizedCaller returns (ebool approved) {
        bytes32 policyId = _addressPolicy[subject];

        // Default deny: no policy bound
        if (policyId == bytes32(0)) {
            approved = asEbool(false);
            FHE.allowTransient(approved, msg.sender);
            return approved;
        }

        ConfidentialPolicy storage p = _policies[policyId];

        // Reset rolling counters when time windows expire. Timestamps are
        // plaintext and safe to compare against `block.timestamp`.
        if (block.timestamp >= p.dailyResetAt) {
            euint64 zeroed = asEuint64(0);
            FHE.allowThis(zeroed);
            p.dailyUsed = zeroed;
            p.dailyResetAt = block.timestamp + 1 days;
        }
        if (block.timestamp >= p.monthlyResetAt) {
            euint64 zeroed = asEuint64(0);
            FHE.allowThis(zeroed);
            p.monthlyUsed = zeroed;
            p.monthlyResetAt = block.timestamp + 30 days;
        }

        // Check 1: amount ≤ perTxLimit
        ebool withinTxLimit = FHE.le(amount, p.perTxLimit);
        FHE.allowThis(withinTxLimit);

        // Check 2: dailyUsed + amount ≤ dailyLimit
        euint64 projectedDaily = FHE.add(p.dailyUsed, amount);
        FHE.allowThis(projectedDaily);

        ebool withinDailyLimit = FHE.le(projectedDaily, p.dailyLimit);
        FHE.allowThis(withinDailyLimit);

        // Check 3: monthlyUsed + amount ≤ monthlyLimit
        euint64 projectedMonthly = FHE.add(p.monthlyUsed, amount);
        FHE.allowThis(projectedMonthly);

        ebool withinMonthlyLimit = FHE.le(projectedMonthly, p.monthlyLimit);
        FHE.allowThis(withinMonthlyLimit);

        // Check 4: policy not frozen
        ebool notFrozen = FHE.not(p.frozen);
        FHE.allowThis(notFrozen);

        // Check 5: no manual approval gate active
        ebool noApprovalGate = FHE.not(p.requiresApproval);
        FHE.allowThis(noApprovalGate);

        // Combine: all five checks must be true
        ebool dailyAndMonthly = FHE.and(withinDailyLimit, withinMonthlyLimit);
        FHE.allowThis(dailyAndMonthly);

        ebool financialOk = FHE.and(withinTxLimit, dailyAndMonthly);
        FHE.allowThis(financialOk);

        ebool freezeAndGate = FHE.and(notFrozen, noApprovalGate);
        FHE.allowThis(freezeAndGate);

        approved = FHE.and(financialOk, freezeAndGate);
        FHE.allowThis(approved);

        // Conditionally update rolling counters using `FHE.select` (no branching
        // on encrypted booleans). `FHE.select` returns new handles that require
        // ACL grants.
        euint64 newDailyUsed = FHE.select(approved, projectedDaily, p.dailyUsed);
        euint64 newMonthlyUsed = FHE.select(approved, projectedMonthly, p.monthlyUsed);

        // Re-grant ACL on new counter handles created by `FHE.select`.
        FHE.allowThis(newDailyUsed);
        FHE.allowThis(newMonthlyUsed);
        FHE.allow(newDailyUsed, p.policyAdmin);
        FHE.allow(newMonthlyUsed, p.policyAdmin);

        p.dailyUsed = newDailyUsed;
        p.monthlyUsed = newMonthlyUsed;

        // Grant transient ACL to caller so they can use the encrypted result
        // within this transaction.
        FHE.allowTransient(approved, msg.sender);

        emit PolicyEvaluated(policyId, subject, block.timestamp);

        if (auditLogger != address(0)) {
            FHE.allow(amount, auditLogger);
            FHE.allow(p.riskTier, auditLogger);
            FHE.allow(approved, auditLogger);
            IAuditLogger(auditLogger).logEvaluation(policyId, subject, amount, p.riskTier, approved);
        }

        return approved;
    }

    /**
     * @notice Evaluate compliance tier only - for RWA / KYC gating.
     *
     * @dev    The required tier is passed as plaintext uint8 by the caller
     *         (the requirement itself is not sensitive - e.g. "accredited
     *         investor = tier 2" is public knowledge). Only the user's actual
     *         tier is encrypted and compared in ciphertext.
     *
     *         FHE.ge(complianceTier, required) returns encrypted true if the
     *         subject's tier is sufficient - without revealing what tier they hold.
     *
     * @param subject       Wallet to check
     * @param requiredTier  Minimum tier required (plaintext - the requirement is public)
     * @return meetsCompliance Encrypted bool
     */
    function evaluateCompliance(
        address subject,
        uint8 requiredTier
    ) external onlyAuthorizedCaller returns (ebool meetsCompliance) {
        bytes32 policyId = _addressPolicy[subject];

        if (policyId == bytes32(0)) {
            meetsCompliance = asEbool(false);
            FHE.allowTransient(meetsCompliance, msg.sender);
            return meetsCompliance;
        }

        // Convert plaintext requirement to encrypted for homomorphic comparison
        euint8 required = asEuint8(requiredTier);
        FHE.allowThis(required);

        meetsCompliance = FHE.ge(_policies[policyId].complianceTier, required);
        FHE.allowThis(meetsCompliance);
        FHE.allowTransient(meetsCompliance, msg.sender);

        return meetsCompliance;
    }

    // AUDITOR MANAGEMENT

    /**
     * @notice Grant an auditor address read (decrypt) access to a policy's
     *         encrypted handles.
     *
     * @dev    FHE.allow(handle, auditor) registers the auditor in the ACL
     *         contract so the KMS Gateway will honour their decryption request
     *         for those specific handles. The auditor then calls the KMS
     *         Gateway off-chain; the KMS returns a signed plaintext that the
     *         AuditLogger verifies on-chain via FHE.checkSignatures().
     *
     *         Note: FHE ACL grants are append-only - they cannot be revoked
     *         for handles that were granted before revocation. Revocation in
     *         _auditors prevents new handles (created after revocation) from
     *         being granted. Design policies with this in mind for high-security
     *         scenarios.
     */
    function grantAuditor(bytes32 policyId, address auditor) external onlyPolicyAdmin(policyId) policyExists(policyId) {
        _auditors[policyId][auditor] = true;

        ConfidentialPolicy storage p = _policies[policyId];

        // Grant decrypt access on all sensitive handles
        FHE.allow(p.perTxLimit, auditor);
        FHE.allow(p.dailyLimit, auditor);
        FHE.allow(p.monthlyLimit, auditor);
        FHE.allow(p.riskTier, auditor);
        FHE.allow(p.complianceTier, auditor);
        FHE.allow(p.dailyUsed, auditor);
        FHE.allow(p.monthlyUsed, auditor);
        FHE.allow(p.frozen, auditor);

        emit AuditorGranted(policyId, auditor);
    }

    /**
     * @notice Revoke auditor - new handles going forward will not be granted.
     *
     * @dev    Historical handles already granted remain accessible to this
     *         auditor (ACL is append-only). If this is a concern, rotate
     *         all policy values after revoking (updatePerTxLimit etc.) so
     *         fresh handles with no revoked-auditor permission are produced.
     */
    function revokeAuditor(bytes32 policyId, address auditor) external onlyPolicyAdmin(policyId) {
        _auditors[policyId][auditor] = false;
        emit AuditorRevoked(policyId, auditor);
    }

    // CALLER AUTHORIZATION

    /**
     * @notice Whitelist a downstream contract to call evaluateTransaction().
     *
     * @dev    Only whitelisted callers can invoke evaluation. This prevents
     *         arbitrary contracts from triggering policy checks (and consuming
     *         gas on someone else's policy counter updates).
     */
    function authorizeCaller(address caller) external onlyOwner {
        _authorizedCallers[caller] = true;
        emit CallerAuthorized(caller);
    }

    /**
     * @notice Remove a downstream contract from the whitelist.
     */
    function revokeCaller(address caller) external onlyOwner {
        _authorizedCallers[caller] = false;
        emit CallerRevoked(caller);
    }

    /**
     * @notice Set the on-chain Policy Registry contract address.
     */
    function setPolicyRegistry(address _registry) external onlyOwner {
        policyRegistry = _registry;
    }

    /**
     * @notice Set the on-chain Audit Logger contract address.
     */
    function setAuditLogger(address _logger) external onlyOwner {
        auditLogger = _logger;
    }

    // ADMIN TRANSFER (2-STEP)

    /**
     * @notice Step 1 of admin handover - nominate a new admin.
     *
     * @dev    2-step transfer prevents accidental transfer to wrong address.
     *         Current admin initiates → new admin must explicitly accept.
     *         Until accepted the current admin retains all powers.
     */
    function initiateAdminTransfer(
        bytes32 policyId,
        address newAdmin
    ) external onlyPolicyAdmin(policyId) policyExists(policyId) {
        if (newAdmin == address(0)) revert ZeroAddress();
        _policies[policyId].pendingAdmin = newAdmin;
        emit AdminTransferInitiated(policyId, newAdmin);
    }

    /**
     * @notice Step 2 of admin handover - pending admin accepts.
     *
     * @dev    On acceptance we grant the new admin ACL access on all current
     *         handles so they can request KMS decryption for auditing.
     *         ACL on old admin's handles is NOT revoked (append-only).
     */
    function acceptAdminTransfer(bytes32 policyId) external policyExists(policyId) {
        ConfidentialPolicy storage p = _policies[policyId];
        if (p.pendingAdmin != msg.sender) revert NotPendingAdmin();

        // Grant new admin ACL access on all current handles
        FHE.allow(p.perTxLimit, msg.sender);
        FHE.allow(p.dailyLimit, msg.sender);
        FHE.allow(p.monthlyLimit, msg.sender);
        FHE.allow(p.riskTier, msg.sender);
        FHE.allow(p.complianceTier, msg.sender);
        FHE.allow(p.dailyUsed, msg.sender);
        FHE.allow(p.monthlyUsed, msg.sender);

        p.policyAdmin = msg.sender;
        p.pendingAdmin = address(0);
        p.updatedAt = block.timestamp;

        emit AdminTransferAccepted(policyId, msg.sender);
    }

    // VIEW FUNCTIONS  (plaintext metadata only - no encrypted values)

    /**
     * @notice Returns plaintext metadata about a policy.
     *         Encrypted rule values are NOT returned here; authorised
     *         auditors use getEncryptedHandles() + off-chain KMS decryption.
     */
    function getPolicyMetadata(
        bytes32 policyId
    )
        external
        view
        policyExists(policyId)
        returns (
            address policyAdmin,
            address pendingAdmin,
            bool exists,
            uint256 createdAt,
            uint256 updatedAt,
            uint256 dailyResetAt,
            uint256 monthlyResetAt
        )
    {
        ConfidentialPolicy storage p = _policies[policyId];
        return (p.policyAdmin, p.pendingAdmin, p.exists, p.createdAt, p.updatedAt, p.dailyResetAt, p.monthlyResetAt);
    }

    /**
     * @notice Returns the policyId currently bound to a wallet address.
     *         Returns bytes32(0) if no binding exists.
     */
    function getPolicyForAddress(address subject) external view returns (bytes32) {
        return _addressPolicy[subject];
    }

    /**
     * @notice Returns true if an address has an active policy binding.
     */
    function hasPolicy(address subject) external view returns (bool) {
        bytes32 id = _addressPolicy[subject];
        return id != bytes32(0) && _policies[id].exists;
    }

    /**
     * @notice Returns encrypted handles for callers with ACL access.
     *
     * @dev    Handles are opaque bytes32 pointers. Callers without ACL
     *         permission cannot decrypt them - the KMS will reject their
     *         decryption request. Only auditors granted via grantAuditor()
     *         can use these handles to request off-chain KMS decryption.
     */
    function getEncryptedHandles(
        bytes32 policyId
    )
        external
        view
        policyExists(policyId)
        returns (
            euint64 perTxLimit,
            euint64 dailyLimit,
            euint64 monthlyLimit,
            euint8 riskTier,
            euint8 complianceTier,
            euint64 dailyUsed,
            euint64 monthlyUsed,
            ebool frozen,
            ebool requiresApproval
        )
    {
        ConfidentialPolicy storage p = _policies[policyId];
        return (
            p.perTxLimit,
            p.dailyLimit,
            p.monthlyLimit,
            p.riskTier,
            p.complianceTier,
            p.dailyUsed,
            p.monthlyUsed,
            p.frozen,
            p.requiresApproval
        );
    }

    /**
     * @notice Check whether an address has auditor rights for a policy.
     */
    function isAuditor(bytes32 policyId, address auditor) external view returns (bool) {
        return _auditors[policyId][auditor];
    }

    /**
     * @notice Check whether a contract is an authorised CPE caller.
     */
    function isAuthorizedCaller(address caller) external view returns (bool) {
        return _authorizedCallers[caller];
    }
}
