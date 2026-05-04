// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)
pragma solidity ^0.8.24;

import "@fhevm/solidity/lib/FHE.sol";

/**
 * @title ICPEGateway
 * @notice Interface that downstream contracts use to integrate with CPE.
 *         Any contract can call evaluateTransaction to check policy before
 *         executing sensitive operations.
 */
interface ICPEGateway {
    /**
     * @notice Evaluate whether a transaction is permitted for a subject address.
     * @param subject     The wallet address whose policy is being checked
     * @param amount      Encrypted transaction amount (materialised handle)
     * @return approved   Encrypted boolean result — use with FHE.req()
     */
    function evaluateTransaction(
        address subject,
        euint64 amount
    ) external returns (ebool approved);

    /**
     * @notice Evaluate compliance tier for a subject.
     * @param subject      Wallet address to check
     * @param requiredTier Minimum tier required (plaintext)
     * @return meetsCompliance Encrypted boolean
     */
    function evaluateCompliance(address subject, uint8 requiredTier) external returns (ebool meetsCompliance);
}
