// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)
pragma solidity ^0.8.24;

import "./libraries/CPEErrors.sol";

/**
 * @title PolicyRegistry
 * @notice Standalone address-to-policy registry.
 *         Pure Solidity — no FHE. Manages which wallet address
 *         is governed by which policy.
 *
 * @dev This is the reason why the same wallet on MetaMask, Trust Wallet,
 *      or a CLI hits the same encrypted policy. The binding is on the
 *      address itself, not the session or the frontend.
 *
 *      Separation from CPE:
 *      - CPE owns the encrypted policy data
 *      - Registry owns the address → policyId mapping
 *      - CPE calls Registry to resolve subject → policyId on every evaluation
 *      - Keeps CPE contract leaner and registry independently upgradeable
 *
 *      One address = one active policy at a time.
 *      One policy can govern many addresses.
 */
contract PolicyRegistry {
    // State

    /// @dev address → policyId
    mapping(address => bytes32) private _addressPolicy;

    /// @dev policyId → all addresses governed by it
    mapping(bytes32 => address[]) private _policyAddresses;

    /// @dev policyId → address → index in _policyAddresses array (for O(1) removal)
    mapping(bytes32 => mapping(address => uint256)) private _addressIndex;

    /// @dev policyId → address → is currently bound
    mapping(bytes32 => mapping(address => bool)) private _isBound;

    /// @dev who is allowed to write to this registry
    /// Only the CPE contract and the policy admin (via CPE) should write here
    mapping(address => bool) private _authorizedWriters;

    /// @dev engine owner
    address public owner;

    // Events

    event AddressBound(bytes32 indexed policyId, address indexed subject, address indexed boundBy, uint256 timestamp);

    event AddressUnbound(
        bytes32 indexed policyId,
        address indexed subject,
        address indexed unboundBy,
        uint256 timestamp
    );

    event WriterAuthorized(address indexed writer);
    event WriterRevoked(address indexed writer);

    // Modifiers

    modifier onlyOwner() {
        if (msg.sender != owner) revert CPEErrors.NotOwner();
        _;
    }

    modifier onlyAuthorizedWriter() {
        if (!_authorizedWriters[msg.sender] && msg.sender != owner) {
            revert CPEErrors.UnauthorizedCaller();
        }
        _;
    }

    // Constructor

    constructor() {
        owner = msg.sender;
    }

    // Writer management

    /**
     * @notice Authorize an address to write to this registry.
     * @dev Should be called with the CPE contract address after deployment.
     *      Only the CPE contract should be writing here in production.
     */
    function authorizeWriter(address writer) external onlyOwner {
        _authorizedWriters[writer] = true;
        emit WriterAuthorized(writer);
    }

    function revokeWriter(address writer) external onlyOwner {
        _authorizedWriters[writer] = false;
        emit WriterRevoked(writer);
    }

    // Binding functions

    /**
     * @notice Bind a wallet address to a policy.
     * @dev Replaces any existing binding on the address.
     *      If address was previously bound to another policy, it is
     *      automatically unbound from that policy first.
     *
     * @param policyId  The policy to bind to
     * @param subject   The wallet address to bind
     */
    function bindAddress(bytes32 policyId, address subject) external onlyAuthorizedWriter {
        if (subject == address(0)) revert CPEErrors.ZeroAddress();
        if (policyId == bytes32(0)) revert CPEErrors.PolicyNotFound();

        bytes32 currentPolicy = _addressPolicy[subject];

        // If already bound to a different policy, clean up that binding first
        if (currentPolicy != bytes32(0) && currentPolicy != policyId) {
            _removeFromPolicyList(currentPolicy, subject);
        }

        // Bind to new policy
        _addressPolicy[subject] = policyId;

        // Only add to policy list if not already there
        if (!_isBound[policyId][subject]) {
            _isBound[policyId][subject] = true;
            _addressIndex[policyId][subject] = _policyAddresses[policyId].length;
            _policyAddresses[policyId].push(subject);
        }

        emit AddressBound(policyId, subject, msg.sender, block.timestamp);
    }

    /**
     * @notice Bind multiple addresses to the same policy in one tx.
     * @dev Gas-efficient batch binding.
     *      Useful for onboarding an entire trading desk at once.
     */
    function bindAddressBatch(bytes32 policyId, address[] calldata subjects) external onlyAuthorizedWriter {
        if (policyId == bytes32(0)) revert CPEErrors.PolicyNotFound();

        uint256 len = subjects.length;
        for (uint256 i = 0; i < len; ) {
            address subject = subjects[i];
            if (subject == address(0)) revert CPEErrors.ZeroAddress();

            bytes32 currentPolicy = _addressPolicy[subject];
            if (currentPolicy != bytes32(0) && currentPolicy != policyId) {
                _removeFromPolicyList(currentPolicy, subject);
            }

            _addressPolicy[subject] = policyId;

            if (!_isBound[policyId][subject]) {
                _isBound[policyId][subject] = true;
                _addressIndex[policyId][subject] = _policyAddresses[policyId].length;
                _policyAddresses[policyId].push(subject);
            }

            emit AddressBound(policyId, subject, msg.sender, block.timestamp);

            unchecked {
                ++i;
            }
        }
    }

    /**
     * @notice Unbind an address from its current policy.
     * @param subject The wallet address to unbind
     */
    function unbindAddress(address subject) external onlyAuthorizedWriter {
        bytes32 policyId = _addressPolicy[subject];
        if (policyId == bytes32(0)) revert CPEErrors.NoPolicyBound();

        _removeFromPolicyList(policyId, subject);
        delete _addressPolicy[subject];

        emit AddressUnbound(policyId, subject, msg.sender, block.timestamp);
    }

    /**
     * @notice Unbind all addresses from a policy.
     * @dev Called when a policy is being decommissioned.
     *      WARNING: Gas cost scales with number of bound addresses.
     *      For large sets, use unbindAddressBatch instead.
     */
    function unbindAllFromPolicy(bytes32 policyId) external onlyAuthorizedWriter {
        address[] memory subjects = _policyAddresses[policyId];
        uint256 len = subjects.length;

        for (uint256 i = 0; i < len; ) {
            address subject = subjects[i];
            delete _addressPolicy[subject];
            delete _isBound[policyId][subject];
            delete _addressIndex[policyId][subject];

            emit AddressUnbound(policyId, subject, msg.sender, block.timestamp);
            unchecked {
                ++i;
            }
        }

        delete _policyAddresses[policyId];
    }

    // Internal helpers

    /**
     * @dev Remove a subject from the policy's address list using swap-and-pop.
     *      O(1) removal — no shifting.
     */
    function _removeFromPolicyList(bytes32 policyId, address subject) internal {
        if (!_isBound[policyId][subject]) return;

        address[] storage list = _policyAddresses[policyId];
        uint256 idx = _addressIndex[policyId][subject];
        uint256 lastIdx = list.length - 1;

        if (idx != lastIdx) {
            address lastAddr = list[lastIdx];
            list[idx] = lastAddr;
            _addressIndex[policyId][lastAddr] = idx;
        }

        list.pop();
        delete _addressIndex[policyId][subject];
        delete _isBound[policyId][subject];
    }

    // Views

    /**
     * @notice Returns the policyId bound to an address.
     * @return bytes32(0) if no policy is bound.
     */
    function getPolicyForAddress(address subject) external view returns (bytes32) {
        return _addressPolicy[subject];
    }

    /**
     * @notice Returns true if the address has an active policy binding.
     */
    function hasPolicy(address subject) external view returns (bool) {
        return _addressPolicy[subject] != bytes32(0);
    }

    /**
     * @notice Returns all addresses bound to a policy.
     * @dev Useful for admin dashboards. Not gas-efficient for on-chain use.
     */
    function getAddressesForPolicy(bytes32 policyId) external view returns (address[] memory) {
        return _policyAddresses[policyId];
    }

    /**
     * @notice Returns the count of addresses bound to a policy.
     */
    function getBoundAddressCount(bytes32 policyId) external view returns (uint256) {
        return _policyAddresses[policyId].length;
    }

    /**
     * @notice Returns true if the specific address is bound to the specific policy.
     */
    function isAddressBoundToPolicy(bytes32 policyId, address subject) external view returns (bool) {
        return _isBound[policyId][subject];
    }

    /**
     * @notice Returns true if address is an authorized registry writer.
     */
    function isAuthorizedWriter(address writer) external view returns (bool) {
        return _authorizedWriters[writer] || writer == owner;
    }
}
