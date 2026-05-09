// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)
pragma solidity ^0.8.24;

interface IPolicyRegistry {
    function bindAddress(bytes32 policyId, address subject) external;
    function unbindAddress(address subject) external;
}
