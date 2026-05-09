// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)
pragma solidity ^0.8.24;

import "@fhevm/solidity/lib/FHE.sol";

interface IAuditLogger {
    function logEvaluation(
        bytes32 policyId,
        address subject,
        euint64 encAmount,
        euint8 encRiskTier,
        ebool encApproved
    ) external returns (uint256);

    function logEvent(
        bytes32 policyId,
        address subject,
        uint8 eventType
    ) external returns (uint256);
}
