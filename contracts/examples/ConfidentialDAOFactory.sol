// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)
pragma solidity ^0.8.24;

import "./ConfidentialDAO.sol";

/**
 * @title ConfidentialDAOFactory
 * @notice Factory to deploy and track Confidential DAO Treasury instances.
 *         Enables the DApp to "discover" all deployed DAOs for a user.
 */
contract ConfidentialDAOFactory {
    address[] public allDAOs;
    
    // Mapping to quickly check if an address was deployed by this factory
    mapping(address => bool) public isDAO;
    
    // Track DAOs created by a specific admin
    mapping(address => address[]) public daosByAdmin;

    event DAOCreated(address indexed dao, address indexed admin, string name);

    /**
     * @notice Deploy a new Confidential DAO.
     * @param gateway The CPE Gateway address (integration surface).
     * @param name    Human-readable name for the registry.
     */
    function createDAO(address gateway, string calldata name) external returns (address) {
        ConfidentialDAO newDAO = new ConfidentialDAO(gateway, msg.sender);
        address daoAddr = address(newDAO);
        
        allDAOs.push(daoAddr);
        isDAO[daoAddr] = true;
        daosByAdmin[msg.sender].push(daoAddr);
        
        emit DAOCreated(daoAddr, msg.sender, name);
        return daoAddr;
    }

    /**
     * @notice Returns the total number of DAOs deployed.
     */
    function getDAOCount() external view returns (uint256) {
        return allDAOs.length;
    }

    /**
     * @notice Returns all DAOs (for discovery scanning).
     */
    function getAllDAOs() external view returns (address[] memory) {
        return allDAOs;
    }
}
