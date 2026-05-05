// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)
import { ethers } from "hardhat";
import * as fs from "fs";

/**
 * @title System Wiring Health Check
 * @notice Verifies the complete chain of trust from Downstream -> Gateway -> Engine -> Infrastructure.
 */
async function main() {
  const deployments = JSON.parse(fs.readFileSync("./deploy/deployments.sepolia.json", "utf8"));
  const [signer] = await ethers.getSigners();

  console.log("\n" + "═".repeat(60));
  console.log("  CONFIDENTIAL POLICY ENGINE - SYSTEM HEALTH CHECK");
  console.log("═".repeat(60));
  console.log(`Network:  sepolia`);
  console.log(`Operator: ${signer.address}\n`);

  const cpe = await ethers.getContractAt("ConfidentialPolicyEngine", deployments.contracts.ConfidentialPolicyEngine);
  const gateway = await ethers.getContractAt("CPEGateway", deployments.contracts.CPEGateway);
  const registry = await ethers.getContractAt("PolicyRegistry", deployments.contracts.PolicyRegistry);
  const logger = await ethers.getContractAt("AuditLogger", deployments.contracts.AuditLogger);

  // 1. Check INFRASTRUCTURE Permissions
  console.log("1. Infrastructure Connectivity:");
  
  const isWriter = await registry.isAuthorizedWriter(deployments.contracts.ConfidentialPolicyEngine);
  console.log(`   - CPE can write to Registry?   [${isWriter ? "✓" : "✗"}]`);

  const isLogger = await logger.isAuthorizedLogger(deployments.contracts.ConfidentialPolicyEngine);
  console.log(`   - CPE can write to AuditLogger? [${isLogger ? "✓" : "✗"}]`);

  // 2. Check GATEWAY -> ENGINE Authorization
  console.log("\n2. Engine Routing:");
  
  const isGatewayAuthorized = await cpe.isAuthorizedCaller(deployments.contracts.CPEGateway);
  console.log(`   - Gateway authorized in CPE?   [${isGatewayAuthorized ? "✓" : "✗"}]`);

  // 3. Check CALLER -> GATEWAY Registration
  console.log("\n3. Downstream Integrations:");
  
  const vaultAddr = deployments.contracts.ConfidentialVault;
  const isVaultActive = await gateway.isActiveCaller(vaultAddr);
  console.log(`   - Vault registered in Gateway? [${isVaultActive ? "✓" : "✗"}]`);

  const daoFactoryAddr = deployments.contracts.ConfidentialDAOFactory;
  console.log(`   - DAO Factory deployed at?     [${daoFactoryAddr ? "✓" : "✗"}]`);

  // Factory doesn't call evaluateTransaction, but let's check the Demo DAO if it exists
  if (deployments.contracts.ConfidentialDAO) {
      const daoAddr = deployments.contracts.ConfidentialDAO;
      const isDaoActive = await gateway.isActiveCaller(daoAddr);
      console.log(`   - Demo DAO registered?         [${isDaoActive ? "✓" : "✗"}]`);
  }

  console.log("\n" + "═".repeat(60));
  
  const allClear = isWriter && isLogger && isGatewayAuthorized && isVaultActive;
  if (allClear) {
    console.log("  SYSTEM HEALTH: OPTIMAL");
  } else {
    console.log("  SYSTEM HEALTH: DEGRADED (Check ✗ marks above)");
  }
  console.log("═".repeat(60) + "\n");
}

main().catch(console.error);
