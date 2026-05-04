// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)

import { ethers, network } from "hardhat";
import { writeFileSync } from "fs";

/**
 * Deploy script - wires all 5 CPE contracts in the correct order.
 *
 * Deployment order matters:
 *   1. PolicyRegistry      (no deps)
 *   2. AuditLogger         (needs KMS Gateway address)
 *   3. ConfidentialPolicyEngine
 *   4. CPEGateway          (needs CPE address)
 *   5. ConfidentialVault   (needs Gateway address - demo downstream)
 *
 * Post-deploy wiring:
 *   - Registry.authorizeWriter(CPE)
 *   - AuditLogger.authorizeLogger(CPE)
 *   - CPE.authorizeCaller(Gateway)
 *   - Gateway.registerCaller(Vault)
 *
 * Usage:
 *   Local:   npx hardhat run deploy/01_deploy_cpe.ts -network hardhat
 *   Sepolia: npx hardhat run deploy/01_deploy_cpe.ts -network sepolia
 */

// Zama's deployed KMS Gateway address on Sepolia
// Source: https://docs.zama.org/protocol/references/contracts
const ZAMA_KMS_GATEWAY_SEPOLIA = "0x9D6891A6240D6130c54ae243d8005063D05fE14b";
const ZAMA_KMS_GATEWAY_LOCAL = ethers.ZeroAddress; // mock - unused locally

async function main() {
  const [deployer] = await ethers.getSigners();
  const isLocal = network.name === "hardhat" || network.name === "localhost";
  const kmsGateway = isLocal ? ZAMA_KMS_GATEWAY_LOCAL : ZAMA_KMS_GATEWAY_SEPOLIA;

  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  Confidential Policy Engine - Full Deployment");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Network:     ${network.name}`);
  console.log(`  Deployer:    ${deployer.address}`);
  console.log(`  Balance:     ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);
  console.log(`  KMS Gateway: ${kmsGateway}`);
  console.log("═══════════════════════════════════════════════════════\n");

  // 1. PolicyRegistry
  console.log("1/5 Deploying PolicyRegistry...");
  const registry = await (await ethers.getContractFactory("PolicyRegistry")).deploy();
  await registry.waitForDeployment();
  const registryAddr = await registry.getAddress();
  console.log(`    ✓ ${registryAddr}`);

  // 2. AuditLogger
  console.log("\n2/5 Deploying AuditLogger...");
  const logger = await (await ethers.getContractFactory("AuditLogger")).deploy(kmsGateway);
  await logger.waitForDeployment();
  const loggerAddr = await logger.getAddress();
  console.log(`    ✓ ${loggerAddr}`);

  // 3. ConfidentialPolicyEngine
  console.log("\n3/5 Deploying ConfidentialPolicyEngine...");
  const cpe = await (await ethers.getContractFactory("ConfidentialPolicyEngine")).deploy();
  await cpe.waitForDeployment();
  const cpeAddr = await cpe.getAddress();
  console.log(`    ✓ ${cpeAddr}`);

  // 4. CPEGateway
  console.log("\n4/5 Deploying CPEGateway...");
  const gateway = await (await ethers.getContractFactory("CPEGateway")).deploy(cpeAddr, 10);
  await gateway.waitForDeployment();
  const gatewayAddr = await gateway.getAddress();
  console.log(`    ✓ ${gatewayAddr}`);

  // 5. ConfidentialVault
  console.log("\n5/5 Deploying ConfidentialVault...");
  const vault = await (await ethers.getContractFactory("ConfidentialVault")).deploy(gatewayAddr);
  await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress();
  console.log(`    ✓ ${vaultAddr}`);

  // Post-deploy wiring
  console.log("\n── Wiring contracts...\n");

  let tx = await registry.authorizeWriter(cpeAddr);
  await tx.wait();
  console.log("    ✓ Registry.authorizeWriter(CPE)");

  tx = await logger.authorizeLogger(cpeAddr);
  await tx.wait();
  console.log("    ✓ AuditLogger.authorizeLogger(CPE)");

  tx = await cpe.authorizeCaller(gatewayAddr);
  await tx.wait();
  console.log("    ✓ CPE.authorizeCaller(Gateway)");

  tx = await gateway.registerCaller(vaultAddr, "ConfidentialVault v1");
  await tx.wait();
  console.log('    ✓ Gateway.registerCaller(Vault, "ConfidentialVault v1")');

  // Save
  const deployment = {
    network: network.name,
    chainId: (await ethers.provider.getNetwork()).chainId.toString(),
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      PolicyRegistry: registryAddr,
      AuditLogger: loggerAddr,
      ConfidentialPolicyEngine: cpeAddr,
      CPEGateway: gatewayAddr,
      ConfidentialVault: vaultAddr,
    },
    external: { ZamaKMSGateway: kmsGateway },
  };

  const outPath = `./deploy/deployments.${network.name}.json`;
  writeFileSync(outPath, JSON.stringify(deployment, null, 2));

  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  Deployment Complete");
  console.log("═══════════════════════════════════════════════════════");
  Object.entries(deployment.contracts).forEach(([name, addr]) => {
    console.log(`  ${name.padEnd(26)}: ${addr}`);
  });
  console.log(`\n  Saved: ${outPath}`);
  console.log("═══════════════════════════════════════════════════════\n");

  // Verify on Etherscan
  if (!isLocal) {
    console.log("Waiting 30s for Etherscan indexing...");
    await new Promise((r) => setTimeout(r, 30000));
    const { run } = await import("hardhat");
    const toVerify = [
      { address: registryAddr, args: [] },
      { address: loggerAddr, args: [kmsGateway] },
      { address: cpeAddr, args: [] },
      { address: gatewayAddr, args: [cpeAddr, 10] },
      { address: vaultAddr, args: [gatewayAddr] },
    ];
    for (const v of toVerify) {
      try {
        await run("verify:verify", { address: v.address, constructorArguments: v.args });
        console.log(`    ✓ Verified: ${v.address}`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.log(`    ~ ${msg.includes("Already") ? "Already verified" : "Failed"}: ${v.address}`);
      }
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
