// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)
pragma solidity ^0.8.24;

import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import "../interfaces/IConfidentialPolicyEngine.sol";
import "@fhevm/solidity/lib/FHE.sol";

/**
 * @dev Test fixture to materialize FHE handles for JavaScript tests.
 *
 *      Inherits ZamaEthereumConfig so that FHE.fromExternal() has access
 *      to the FHEVM infrastructure addresses (ACL, InputVerifier, etc.)
 *      in its own storage — exactly the same as ConfidentialVault and CPE.
 *
 *      Without this, all FHE calls silently revert because the ACL address
 *      resolves to address(0).
 */
contract TestHelper is ZamaEthereumConfig {
    IConfidentialPolicyEngine public cpe;

    event Evaluated(ebool result);

    constructor(address _cpe) {
        cpe = IConfidentialPolicyEngine(_cpe);
    }

    /**
     * @notice Materialise the encrypted amount handle and forward to CPE.
     *         Emits Evaluated(ebool) so JS tests can extract the result handle
     *         from the receipt logs without needing ACL-guarded storage reads.
     */
    function evaluate(address subject, externalEuint64 encAmount, bytes calldata proof) external {
        euint64 amount = FHE.fromExternal(encAmount, proof);
        FHE.allowThis(amount);
        FHE.allowTransient(amount, address(cpe));

        ebool result = cpe.evaluateTransaction(subject, amount);
        emit Evaluated(result);
    }
}
