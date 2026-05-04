// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)
pragma solidity ^0.8.24;

/**
 * @title CPERoles
 * @notice Role constants for CPE access control.
 */
library CPERoles {
    bytes32 public constant OWNER_ROLE = keccak256("OWNER_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant AUDITOR_ROLE = keccak256("AUDITOR_ROLE");
    bytes32 public constant CALLER_ROLE = keccak256("CALLER_ROLE");
}
