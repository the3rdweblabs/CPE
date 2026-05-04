// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)
pragma solidity ^0.8.24;

import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import "@fhevm/solidity/lib/FHE.sol";
import "./interfaces/ICPEGateway.sol";
import "./interfaces/IConfidentialPolicyEngine.sol";
import "./libraries/CPEErrors.sol";

/**
 * @title CPEGateway
 * @notice The integration surface for downstream contracts.
 *
 * @dev CPEGateway sits between downstream protocols and the
 *      ConfidentialPolicyEngine. It:
 *
 *      1. Validates that callers are registered and active
 *      2. Forwards evaluation requests to CPE
 *      3. Routes the result back to the caller
 *      4. Maintains a registry of integrated downstream contracts
 *      5. Enforces rate limiting per caller (per block)
 *
 *      Why a separate Gateway instead of calling CPE directly?
 *      - Downstream contracts only need to know the Gateway address
 *      - CPE can be upgraded/replaced without downstream changes
 *      - Gateway adds a caller registry + rate limiting layer
 *      - Cleaner separation: Gateway = routing, CPE = business logic
 *
 *      Integration examples live in the repository README and docs.
 */
contract CPEGateway is ZamaEthereumConfig, ICPEGateway {
    // Structs

    /**
     * @notice Registered downstream contract metadata.
     */
    struct CallerInfo {
        string name; // human-readable label (e.g. "ConfidentialVault v1")
        bool active; // can this caller use the gateway?
        uint256 registeredAt;
        uint256 lastCallBlock; // for rate limiting
        uint256 callsThisBlock; // for rate limiting
        uint256 totalCalls; // lifetime call count
    }

    // State

    /// @dev The ConfidentialPolicyEngine this Gateway routes to
    address public policyEngine;

    /// @dev caller address → CallerInfo
    mapping(address => CallerInfo) public callers;

    /// @dev max calls per block per caller (anti-spam)
    uint256 public maxCallsPerBlock;

    address public owner;

    // Events

    event CallerRegistered(address indexed caller, string name, uint256 timestamp);
    event CallerDeactivated(address indexed caller);
    event CallerReactivated(address indexed caller);
    event PolicyEngineUpdated(address indexed oldEngine, address indexed newEngine);
    event GatewayEvaluation(address indexed caller, address indexed subject, uint256 timestamp);
    event GatewayComplianceCheck(address indexed caller, address indexed subject, uint8 requiredTier);

    // Modifiers

    modifier onlyOwner() {
        if (msg.sender != owner) revert CPEErrors.NotOwner();
        _;
    }

    modifier onlyRegisteredCaller() {
        CallerInfo storage info = callers[msg.sender];
        if (!info.active) revert CPEErrors.UnauthorizedCaller();

        // Rate limit: max N calls per block
        if (info.lastCallBlock == block.number) {
            if (info.callsThisBlock >= maxCallsPerBlock) {
                revert CPEErrors.UnauthorizedCaller(); // rate limited
            }
            info.callsThisBlock++;
        } else {
            info.lastCallBlock = block.number;
            info.callsThisBlock = 1;
        }

        info.totalCalls++;
        _;
    }

    // Constructor

    /**
     * @param _policyEngine Address of the deployed ConfidentialPolicyEngine
     * @param _maxCallsPerBlock Max gateway calls per block per downstream contract
     */
    constructor(address _policyEngine, uint256 _maxCallsPerBlock) {
        if (_policyEngine == address(0)) revert CPEErrors.ZeroAddress();
        owner = msg.sender;
        policyEngine = _policyEngine;
        maxCallsPerBlock = _maxCallsPerBlock == 0 ? 10 : _maxCallsPerBlock;
    }

    // Caller registry

    /**
     * @notice Register a downstream contract as an authorized Gateway caller.
     * @dev Only the owner (CPE deployer) can register callers.
     *      The registered address must also be authorized in CPE itself —
     *      CPE has its own _authorizedCallers check.
     *
     * @param caller  The downstream contract address
     * @param name    Human-readable label for this integration
     */
    function registerCaller(address caller, string calldata name) external onlyOwner {
        if (caller == address(0)) revert CPEErrors.ZeroAddress();

        callers[caller] = CallerInfo({
            name: name,
            active: true,
            registeredAt: block.timestamp,
            lastCallBlock: 0,
            callsThisBlock: 0,
            totalCalls: 0
        });

        emit CallerRegistered(caller, name, block.timestamp);
    }

    /**
     * @notice Deactivate a downstream caller — blocks future gateway calls.
     */
    function deactivateCaller(address caller) external onlyOwner {
        callers[caller].active = false;
        emit CallerDeactivated(caller);
    }

    /**
     * @notice Reactivate a previously deactivated caller.
     */
    function reactivateCaller(address caller) external onlyOwner {
        callers[caller].active = true;
        emit CallerReactivated(caller);
    }

    /**
     * @notice Update rate limit.
     */
    function setMaxCallsPerBlock(uint256 max) external onlyOwner {
        maxCallsPerBlock = max;
    }

    // Policy engine routing

    /**
     * @notice Update the CPE address this Gateway routes to.
     * @dev Allows upgrading CPE without redeploying all downstream contracts.
     *      Downstream contracts only need the Gateway address — Gateway handles
     *      routing to the current CPE version.
     */
    function setPolicyEngine(address newEngine) external onlyOwner {
        if (newEngine == address(0)) revert CPEErrors.ZeroAddress();
        address old = policyEngine;
        policyEngine = newEngine;
        emit PolicyEngineUpdated(old, newEngine);
    }

    // Core gateway functions (ICPEGateway implementation)

    /**
     * @notice Evaluate a transaction against the subject's encrypted policy.
     * @dev This is the single integration point for all downstream contracts.
     *
     *      Downstream contract calls this → Gateway validates caller →
     *      Gateway calls CPE.evaluateTransaction() → CPE runs FHE checks →
     *      Returns ebool approved → Gateway passes back to caller →
     *      Caller does FHE.req(approved).
     *
     *      The ebool travels from CPE → Gateway → downstream contract in the
     *      same transaction via FHE.allowTransient() grants.
     *
     * @param subject     Wallet being evaluated
     * @param encAmount   Encrypted transaction amount (encrypted by user client-side)
     * @param inputProof  ZKPoK for the encrypted amount
     * @return approved   Encrypted boolean — use with FHE.req() in caller
     */
    // function evaluateTransaction(
    //     address subject,
    //     externalEuint64 encAmount,
    //     bytes calldata inputProof
    // ) external override onlyRegisteredCaller returns (ebool approved) {
    //     // Forward to CPE
    //     // CPE.evaluateTransaction() will FHE.allowTransient(approved, address(this))
    //     // We then re-grant transient access to the actual caller (downstream contract)
    //     (bool success, bytes memory data) = policyEngine.call(
    //         abi.encodeWithSignature(
    //             "evaluateTransaction(address,bytes32,bytes)",
    //             subject,
    //             encAmount,
    //             inputProof
    //         )
    //     );

    //     if (!success) {
    //         // Bubble up the revert
    //         assembly {
    //             revert(add(data, 32), mload(data))
    //         }
    //     }

    //     approved = abi.decode(data, (ebool));

    //     // Grant transient access to the downstream caller for this tx
    //     FHE.allowTransient(approved, msg.sender);

    //     emit GatewayEvaluation(msg.sender, subject, block.timestamp);
    //     return approved;
    // }
    function evaluateTransaction(
        address subject,
        externalEuint64 encAmount,
        bytes calldata inputProof
    ) external override onlyRegisteredCaller returns (ebool approved) {
        // Typed call into CPE (avoids encodeWithSignature selector/type mismatches)
        approved = IConfidentialPolicyEngine(policyEngine).evaluateTransaction(subject, encAmount, inputProof);

        // Grant transient access to the downstream caller (e.g. Vault) for this tx
        FHE.allowTransient(approved, msg.sender);

        emit GatewayEvaluation(msg.sender, subject, block.timestamp);
        return approved;
    }

    /**
     * @notice Evaluate compliance tier for a subject.
     * @dev Forwards the compliance check to CPE without the downstream
     *      contract needing to know the CPE address directly.
     *
     * @param subject       Wallet being checked
     * @param requiredTier  Minimum tier required (plaintext — the requirement is not sensitive)
     * @return meetsCompliance Encrypted boolean
     */
    function evaluateCompliance(
        address subject,
        uint8 requiredTier
    ) external override onlyRegisteredCaller returns (ebool meetsCompliance) {
        meetsCompliance = IConfidentialPolicyEngine(policyEngine).evaluateCompliance(subject, requiredTier);

        FHE.allowTransient(meetsCompliance, msg.sender);
        emit GatewayComplianceCheck(msg.sender, subject, requiredTier);
        return meetsCompliance;
    }

    // ─────────────────────────────────────────────
    // VIEWS
    // ─────────────────────────────────────────────

    /**
     * @notice Returns true if a caller is registered and active.
     */
    function isActiveCaller(address caller) external view returns (bool) {
        return callers[caller].active;
    }

    /**
     * @notice Returns caller metadata.
     */
    function getCallerInfo(
        address caller
    ) external view returns (string memory name, bool active, uint256 registeredAt, uint256 totalCalls) {
        CallerInfo storage info = callers[caller];
        return (info.name, info.active, info.registeredAt, info.totalCalls);
    }
}
