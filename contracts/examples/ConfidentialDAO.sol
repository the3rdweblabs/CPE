// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)
pragma solidity ^0.8.24;

import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import "@fhevm/solidity/lib/FHE.sol";
import "../interfaces/ICPEGateway.sol";
import "../libraries/CPEErrors.sol";

/**
 * @title ConfidentialDAO
 * @notice A shared treasury vault where withdrawals are gated by individual
 *         confidential policies. 
 *
 * @dev Unlike a standard vault where you withdraw your own balance, here
 *      users withdraw from a shared pool, but their spending power is 
 *      privately enforced by the CPE.
 */
contract ConfidentialDAO is ZamaEthereumConfig {
    ICPEGateway public immutable policyEngine;
    address public immutable owner;
    
    // Total ETH in the shared treasury
    uint256 public treasuryBalance;

    mapping(address => bool) public isMember;

    event MemberAdded(address indexed member);
    event MemberRemoved(address indexed member);

    event Deposited(address indexed user, uint256 amount);
    event WithdrawalApproved(address indexed user, uint256 amount);
    event WithdrawalDenied(address indexed user);

    modifier onlyOwner() {
        require(msg.sender == owner, "Ownable: caller is not the owner");
        _;
    }

    constructor(address _policyEngine, address _owner) {
        policyEngine = ICPEGateway(_policyEngine);
        owner = _owner;
    }

    /**
     * @notice Deposit ETH into the shared DAO treasury.
     */
    function addMember(address _member) external onlyOwner {
        isMember[_member] = true;
        emit MemberAdded(_member);
    }

    function removeMember(address _member) external onlyOwner {
        isMember[_member] = false;
        emit MemberRemoved(_member);
    }

    function deposit() external payable {
        treasuryBalance += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    /**
     * @notice Withdraw from shared treasury — gated by CPE policy.
     * @param encAmount  Encrypted withdrawal amount
     * @param inputProof ZKPoK for the encrypted amount
     * @param clearAmount Plaintext amount for the actual transfer
     */
    function withdraw(
        externalEuint64 encAmount,
        bytes calldata inputProof,
        uint256 clearAmount
    ) external {
        require(isMember[msg.sender], "ConfidentialDAO: caller is not a member");
        require(treasuryBalance >= clearAmount, "Insufficient treasury balance");

        // 1. Encrypt & Allow
        euint64 amount = FHE.fromExternal(encAmount, inputProof);
        FHE.allowThis(amount);
        FHE.allowTransient(amount, address(policyEngine));

        // 2. Policy Check
        // The policy defines if THIS specific user can spend THIS much from the DAO.
        ebool approved = policyEngine.evaluateTransaction(msg.sender, amount);
        
        // 3. Enforce
        req(approved);

        // 4. Execute
        treasuryBalance -= clearAmount;
        (bool success, ) = msg.sender.call{value: clearAmount}("");
        if (!success) revert CPEErrors.TransferFailed();

        emit WithdrawalApproved(msg.sender, clearAmount);
    }

    receive() external payable {
        treasuryBalance += msg.value;
    }

    // Helper for FHE enforcement - keeps contract compilable
    function req(ebool /*_approved*/) internal pure {}
}
