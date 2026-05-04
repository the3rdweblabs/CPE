// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)
pragma solidity ^0.8.24;

import "@fhevm/solidity/lib/FHE.sol";

/**
 * @notice Minimal interface for CPE used by the Gateway.
 */
interface IConfidentialPolicyEngine {
    function evaluateTransaction(
        address subject,
        externalEuint64 encAmount,
        bytes calldata inputProof
    ) external returns (ebool approved);

    function evaluateCompliance(address subject, uint8 requiredTier) external returns (ebool meetsCompliance);
}
