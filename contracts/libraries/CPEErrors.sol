// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)
pragma solidity ^0.8.24;

/**
 * @title CPEErrors
 * @notice Custom errors for gas-efficient reverts across CPE contracts.
 */
library CPEErrors {
    error NotOwner();
    error NotPolicyAdmin();
    error NotPendingAdmin();
    error PolicyNotFound();
    error PolicyAlreadyExists();
    error UnauthorizedCaller();
    error NoPolicyBound();
    error ZeroAddress();
    error InvalidTier();
    error PolicyIsFrozen();
    error TransferFailed();
}
