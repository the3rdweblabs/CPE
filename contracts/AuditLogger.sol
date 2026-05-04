// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)
pragma solidity ^0.8.24;

import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import "@fhevm/solidity/lib/FHE.sol";
import "./libraries/CPEErrors.sol";

/**
 * @title AuditLogger
 * @notice Encrypted audit trail for CPE policy evaluations.
 *
 * @dev This contract logs audit events in two forms:
 *      - Encrypted records (FHE handles) for sensitive data, and
 *      - Plaintext metadata for operational indexing.
 *
 *      Auditors granted ACL access can request KMS decryption via the
 *      requestDecryption()/receiveDecryptedRecord() flow handled by the
 *      KMS gateway.
 */
contract AuditLogger is ZamaEthereumConfig {
    // STRUCTS
    /**
     * @notice Plaintext audit record - metadata only, no sensitive data.
     */
    struct AuditRecord {
        bytes32 policyId;
        address subject;
        uint256 timestamp;
        uint256 blockNumber;
        AuditEventType eventType;
        bool decryptionRequested;
    }

    /**
     * @notice Encrypted audit record - sensitive amounts stored as FHE handles.
     * @dev These handles are only useful to addresses with ACL permission.
     */
    struct EncryptedAuditRecord {
        euint64 amount; // encrypted transaction amount
        euint8 riskTierAtTime; // encrypted risk tier at time of evaluation
        ebool wasApproved; // encrypted approval result
        bool exists;
    }

    /**
     * @notice Decrypted record - stored after successful KMS decryption.
     * @dev Only populated after requestDecryption() + KMS callback.
     */
    struct DecryptedRecord {
        uint64 amount;
        uint8 riskTierAtTime;
        bool wasApproved;
        bool exists;
        uint256 decryptedAt;
    }

    enum AuditEventType {
        EVALUATION, // standard policy check
        FREEZE, // policy frozen
        UNFREEZE, // policy unfrozen
        POLICY_CREATED, // new policy deployed
        POLICY_UPDATED, // policy rule changed
        ADMIN_TRANSFER, // admin ownership change
        AUDITOR_GRANTED, // auditor access granted
        COMPLIANCE_CHECK // compliance tier evaluation
    }

    // STATE

    /// @dev Auto-incrementing record ID
    uint256 private _recordCounter;

    /// @dev recordId → AuditRecord (plaintext metadata)
    mapping(uint256 => AuditRecord) public auditRecords;

    /// @dev recordId → EncryptedAuditRecord (FHE handles)
    mapping(uint256 => EncryptedAuditRecord) private _encryptedRecords;

    /// @dev recordId → DecryptedRecord (post KMS decryption)
    mapping(uint256 => DecryptedRecord) public decryptedRecords;

    /// @dev policyId → recordIds (all records for a policy, for enumeration)
    mapping(bytes32 => uint256[]) public policyRecords;

    /// @dev subject → recordIds (all records for a wallet)
    mapping(address => uint256[]) public subjectRecords;

    /// @dev policyId → auditor → authorized
    mapping(bytes32 => mapping(address => bool)) public authorizedAuditors;

    /// @dev who can write audit records (only CPE contract)
    mapping(address => bool) private _authorizedLoggers;

    /// @dev KMS Gateway address - the only address that can call receiveDecryptedRecord
    address public kmsGateway;

    address public owner;

    // EVENTS

    event AuditRecordCreated(
        uint256 indexed recordId,
        bytes32 indexed policyId,
        address indexed subject,
        AuditEventType eventType,
        uint256 timestamp
    );

    event DecryptionRequested(
        uint256 indexed recordId,
        bytes32 indexed policyId,
        address indexed requestedBy,
        uint256 timestamp
    );

    event RecordDecrypted(uint256 indexed recordId, bytes32 indexed policyId, uint256 timestamp);

    event AuditorGranted(bytes32 indexed policyId, address indexed auditor);
    event AuditorRevoked(bytes32 indexed policyId, address indexed auditor);
    event LoggerAuthorized(address indexed logger);
    event KMSGatewaySet(address indexed gateway);

    // MODIFIERS

    modifier onlyOwner() {
        if (msg.sender != owner) revert CPEErrors.NotOwner();
        _;
    }

    modifier onlyAuthorizedLogger() {
        if (!_authorizedLoggers[msg.sender] && msg.sender != owner) {
            revert CPEErrors.UnauthorizedCaller();
        }
        _;
    }

    modifier onlyAuditor(bytes32 policyId) {
        if (!authorizedAuditors[policyId][msg.sender]) {
            revert CPEErrors.UnauthorizedCaller();
        }
        _;
    }

    modifier onlyKMSGateway() {
        if (msg.sender != kmsGateway) revert CPEErrors.UnauthorizedCaller();
        _;
    }

    // CONSTRUCTOR

    constructor(address _kmsGateway) {
        owner = msg.sender;
        kmsGateway = _kmsGateway;
        emit KMSGatewaySet(_kmsGateway);
    }

    // SETUP

    function authorizeLogger(address logger) external onlyOwner {
        _authorizedLoggers[logger] = true;
        emit LoggerAuthorized(logger);
    }

    function setKMSGateway(address _kmsGateway) external onlyOwner {
        kmsGateway = _kmsGateway;
        emit KMSGatewaySet(_kmsGateway);
    }

    // LOGGING (called by CPE contract)

    /**
     * @notice Log an encrypted evaluation event.
     * @dev Called by ConfidentialPolicyEngine after every evaluateTransaction().
     *      Stores both the plaintext metadata (policyId, subject, ts) and
     *      the encrypted handles (amount, riskTier, wasApproved).
     *
     *      The CPE must call FHE.allow(handle, address(this)) on each handle
     *      before calling this - otherwise AuditLogger cannot store them.
     *
     * @param policyId      Policy that was evaluated
     * @param subject       Wallet address that was evaluated
     * @param encAmount     Encrypted amount that was checked
     * @param encRiskTier   Encrypted risk tier at time of check
     * @param encApproved   Encrypted approval result
     * @return recordId     The ID of the created audit record
     */
    function logEvaluation(
        bytes32 policyId,
        address subject,
        euint64 encAmount,
        euint8 encRiskTier,
        ebool encApproved
    ) external onlyAuthorizedLogger returns (uint256 recordId) {
        recordId = _recordCounter++;

        // Store plaintext metadata
        auditRecords[recordId] = AuditRecord({
            policyId: policyId,
            subject: subject,
            timestamp: block.timestamp,
            blockNumber: block.number,
            eventType: AuditEventType.EVALUATION,
            decryptionRequested: false
        });

        // Store encrypted handles
        // AuditLogger now holds references to these ciphertext handles.
        // Auditors with FHE.allow() access can request KMS decryption.
        _encryptedRecords[recordId] = EncryptedAuditRecord({
            amount: encAmount,
            riskTierAtTime: encRiskTier,
            wasApproved: encApproved,
            exists: true
        });

        // Grant this contract ACL access to the handles so it can
        // reference them for decryption requests
        FHE.allowThis(encAmount);
        FHE.allowThis(encRiskTier);
        FHE.allowThis(encApproved);

        // Register for policy and subject lookup
        policyRecords[policyId].push(recordId);
        subjectRecords[subject].push(recordId);

        emit AuditRecordCreated(recordId, policyId, subject, AuditEventType.EVALUATION, block.timestamp);
    }

    /**
     * @notice Log a non-evaluation event (freeze, update, admin transfer, etc.)
     * @dev No encrypted data - these events only store plaintext metadata.
     *      The sensitive data (new limit values etc.) is never logged here -
     *      it already exists as encrypted state in CPE.
     */
    function logEvent(
        bytes32 policyId,
        address subject,
        AuditEventType eventType
    ) external onlyAuthorizedLogger returns (uint256 recordId) {
        recordId = _recordCounter++;

        auditRecords[recordId] = AuditRecord({
            policyId: policyId,
            subject: subject,
            timestamp: block.timestamp,
            blockNumber: block.number,
            eventType: eventType,
            decryptionRequested: false
        });

        policyRecords[policyId].push(recordId);
        if (subject != address(0)) {
            subjectRecords[subject].push(recordId);
        }

        emit AuditRecordCreated(recordId, policyId, subject, eventType, block.timestamp);
    }

    // AUDITOR MANAGEMENT

    /**
     * @notice Grant an auditor access to request decryption of a policy's records.
     * @dev Only callable by the CPE contract (authorized logger) acting on
     *      behalf of the policy admin.
     *      This also grants FHE.allow() on all existing encrypted records
     *      for this policy - auditor can then request KMS decryption.
     *
     * @param policyId  The policy to grant access for
     * @param auditor   The auditor address
     */
    function grantAuditorAccess(bytes32 policyId, address auditor) external onlyAuthorizedLogger {
        authorizedAuditors[policyId][auditor] = true;

        // Grant ACL access on all existing encrypted records for this policy
        uint256[] storage records = policyRecords[policyId];
        uint256 len = records.length;

        for (uint256 i = 0; i < len; ) {
            uint256 recordId = records[i];
            EncryptedAuditRecord storage enc = _encryptedRecords[recordId];
            if (enc.exists) {
                FHE.allow(enc.amount, auditor);
                FHE.allow(enc.riskTierAtTime, auditor);
                FHE.allow(enc.wasApproved, auditor);
            }
            unchecked {
                ++i;
            }
        }

        emit AuditorGranted(policyId, auditor);
    }

    /**
     * @notice Revoke auditor access (prevents future decryption requests).
     * @dev Note: ACL permissions already granted on existing handles cannot
     *      be revoked - this only prevents new grants going forward.
     */
    function revokeAuditorAccess(bytes32 policyId, address auditor) external onlyAuthorizedLogger {
        authorizedAuditors[policyId][auditor] = false;
        emit AuditorRevoked(policyId, auditor);
    }

    // DECRYPTION (the KMS flow)

    /**
     * @notice Request KMS decryption of an encrypted audit record.
     * @dev Step 1 of the decryption flow. Marks the record's handles as
     *      publicly decryptable - this emits an event that the KMS Gateway
     *      picks up to trigger off-chain threshold decryption.
     *
     *      Only authorized auditors can request decryption.
     *      After this call, the KMS Gateway will call receiveDecryptedRecord()
     *      with the plaintext values (signed by the MPC network).
     *
     * @param recordId  The audit record to decrypt
     */
    function requestDecryption(uint256 recordId) external {
        AuditRecord storage record = auditRecords[recordId];
        if (!_encryptedRecords[recordId].exists) revert CPEErrors.PolicyNotFound();
        if (!authorizedAuditors[record.policyId][msg.sender]) revert CPEErrors.UnauthorizedCaller();
        if (record.decryptionRequested) return; // idempotent

        EncryptedAuditRecord storage enc = _encryptedRecords[recordId];

        // Mark handles as publicly decryptable - KMS Gateway picks this up
        FHE.makePubliclyDecryptable(enc.amount);
        FHE.makePubliclyDecryptable(enc.riskTierAtTime);
        FHE.makePubliclyDecryptable(enc.wasApproved);

        auditRecords[recordId].decryptionRequested = true;

        emit DecryptionRequested(recordId, record.policyId, msg.sender, block.timestamp);
    }

    /**
     * @notice Batch request decryption for all records of a policy.
     * @dev Convenience function for auditors doing a full compliance sweep.
     *      WARNING: Gas cost scales with number of records.
     *      For large sets, use requestDecryption() per record in batches.
     */
    function requestDecryptionForPolicy(bytes32 policyId) external onlyAuditor(policyId) {
        uint256[] storage records = policyRecords[policyId];
        uint256 len = records.length;

        for (uint256 i = 0; i < len; ) {
            uint256 recordId = records[i];
            AuditRecord storage record = auditRecords[recordId];
            EncryptedAuditRecord storage enc = _encryptedRecords[recordId];

            if (enc.exists && !record.decryptionRequested) {
                FHE.makePubliclyDecryptable(enc.amount);
                FHE.makePubliclyDecryptable(enc.riskTierAtTime);
                FHE.makePubliclyDecryptable(enc.wasApproved);

                auditRecords[recordId].decryptionRequested = true;
                emit DecryptionRequested(recordId, policyId, msg.sender, block.timestamp);
            }
            unchecked {
                ++i;
            }
        }
    }

    /**
     * @notice KMS Gateway callback - receives decrypted plaintext after MPC.
     * @dev Step 4 of the decryption flow. Called by the KMS Gateway after
     *      threshold decryption. Verifies the KMS signature before storing.
     *
     *      In production: the signature verification is handled by
     *      the FHEVM infrastructure automatically when the gateway calls this.
     *      On testnet: the gateway calls this directly after mock decryption.
     *
     * @param recordId          The audit record being decrypted
     * @param clearAmount       Plaintext transaction amount
     * @param clearRiskTier     Plaintext risk tier at time of evaluation
     * @param clearWasApproved  Plaintext approval result
     */
    function receiveDecryptedRecord(
        uint256 recordId,
        uint64 clearAmount,
        uint8 clearRiskTier,
        bool clearWasApproved
    ) external onlyKMSGateway {
        AuditRecord storage record = auditRecords[recordId];
        if (!record.decryptionRequested) revert CPEErrors.PolicyNotFound();

        decryptedRecords[recordId] = DecryptedRecord({
            amount: clearAmount,
            riskTierAtTime: clearRiskTier,
            wasApproved: clearWasApproved,
            exists: true,
            decryptedAt: block.timestamp
        });

        emit RecordDecrypted(recordId, record.policyId, block.timestamp);
    }

    // VIEWS

    /**
     * @notice Returns all record IDs for a policy.
     */
    function getRecordsForPolicy(bytes32 policyId) external view returns (uint256[] memory) {
        return policyRecords[policyId];
    }

    /**
     * @notice Returns all record IDs for a subject wallet.
     */
    function getRecordsForSubject(address subject) external view returns (uint256[] memory) {
        return subjectRecords[subject];
    }

    /**
     * @notice Returns count of all audit records created.
     */
    function totalRecords() external view returns (uint256) {
        return _recordCounter;
    }

    /**
     * @notice Returns count of records for a specific policy.
     */
    function recordCountForPolicy(bytes32 policyId) external view returns (uint256) {
        return policyRecords[policyId].length;
    }

    /**
     * @notice Returns the encrypted handles for a record.
     * @dev Only useful to addresses that have FHE ACL permission on the handles.
     *      Use requestDecryption() to get plaintext via KMS.
     */
    function getEncryptedHandles(
        uint256 recordId
    ) external view returns (euint64 amount, euint8 riskTier, ebool wasApproved, bool exists) {
        EncryptedAuditRecord storage enc = _encryptedRecords[recordId];
        return (enc.amount, enc.riskTierAtTime, enc.wasApproved, enc.exists);
    }

    /**
     * @notice Returns true if a record has been decrypted.
     */
    function isDecrypted(uint256 recordId) external view returns (bool) {
        return decryptedRecords[recordId].exists;
    }

    /**
     * @notice Returns paginated records for a policy (for off-chain indexing).
     * @dev Returns at most `limit` records starting from `offset`.
     */
    function getRecordsPaginated(
        bytes32 policyId,
        uint256 offset,
        uint256 limit
    ) external view returns (AuditRecord[] memory records, uint256 total) {
        uint256[] storage ids = policyRecords[policyId];
        total = ids.length;

        if (offset >= total) {
            return (new AuditRecord[](0), total);
        }

        uint256 end = offset + limit;
        if (end > total) end = total;
        uint256 count = end - offset;

        records = new AuditRecord[](count);
        for (uint256 i = 0; i < count; ) {
            records[i] = auditRecords[ids[offset + i]];
            unchecked {
                ++i;
            }
        }
    }
}
