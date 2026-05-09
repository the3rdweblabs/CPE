// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)

import { ethers, network, run } from "hardhat";
import { writeFileSync } from "fs";

/**
 * Full Deployment Script - Deploy Core CPE + Example Integrations (Vault & DAO)
 */

const ZAMA_KMS_GATEWAY_SEPOLIA = "0x9D6891A6240D6130c54ae243d8005063D05fE14b";
const ZAMA_KMS_GATEWAY_LOCAL = ethers.ZeroAddress;

async function main() {
  const [deployer] = await ethers.getSigners();
  const isLocal = network.name === "hardhat" || network.name === "localhost";
  const kmsGateway = isLocal ? ZAMA_KMS_GATEWAY_LOCAL : ZAMA_KMS_GATEWAY_SEPOLIA;

  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  Confidential Policy Engine - Full Stack Deployment");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Network:     ${network.name}`);
  console.log(`  Deployer:    ${deployer.address}`);
  console.log("═══════════════════════════════════════════════════════\n");

  // 1. Core Protocol
  console.log("1. Deploying Core Protocol...");
  const registry = await (await ethers.getContractFactory("PolicyRegistry")).deploy();
  await registry.waitForDeployment();
  const registryAddr = await registry.getAddress();

  const logger = await (await ethers.getContractFactory("AuditLogger")).deploy(kmsGateway);
  await logger.waitForDeployment();
  const loggerAddr = await logger.getAddress();

  const cpe = await (await ethers.getContractFactory("ConfidentialPolicyEngine")).deploy();
  await cpe.waitForDeployment();
  const cpeAddr = await cpe.getAddress();

  const gateway = await (await ethers.getContractFactory("CPEGateway")).deploy(cpeAddr, 10);
  await gateway.waitForDeployment();
  const gatewayAddr = await gateway.getAddress();

  // 2. Examples & Demos
  console.log("\n2. Deploying Example Integrations...");
  
  // Example A: Personal Vault
  const vault = await (await ethers.getContractFactory("ConfidentialVault")).deploy(gatewayAddr);
  await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress();
  console.log(`    ✓ Vault:   ${vaultAddr}`);

  // Example B: DAO Factory
  const factory = await (await ethers.getContractFactory("ConfidentialDAOFactory")).deploy();
  await factory.waitForDeployment();
  const factoryAddr = await factory.getAddress();
  console.log(`    ✓ Factory: ${factoryAddr}`);

  // Example C: Initial Demo DAO
  const txCreate = await factory.createDAO(gatewayAddr, "Global Demo DAO");
  const receiptCreate = await txCreate.wait();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const event = receiptCreate?.logs.find((l: any) => (l as any).fragment?.name === "DAOCreated") as any;
  const daoAddr = event?.args?.[0];
  console.log(`    ✓ Demo DAO: ${daoAddr}`);

  // 3. Wiring
  console.log("\n3. Wiring Infrastructure...");

  await (await registry.authorizeWriter(cpeAddr)).wait();
  await (await logger.authorizeLogger(cpeAddr)).wait();
  await (await cpe.setPolicyRegistry(registryAddr)).wait();
  await (await cpe.setAuditLogger(loggerAddr)).wait();
  await (await cpe.authorizeCaller(gatewayAddr)).wait();
  
  // Register Vault in Gateway
  await (await gateway.registerCaller(vaultAddr, "ConfidentialVault v1")).wait();
  
  // Authorize DAO and Vault in CPE (required by _authorizedCallers)
  await (await cpe.authorizeCaller(vaultAddr)).wait();
  await (await cpe.authorizeCaller(daoAddr)).wait();
  
  // Register Demo DAO in Gateway
  await (await gateway.registerCaller(daoAddr, "Global Demo DAO")).wait();

  // 4. Persistence
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
      ConfidentialDAOFactory: factoryAddr,
      ConfidentialDAO: daoAddr,
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

  // 5. Verification
  if (!isLocal) {
    console.log("Waiting 30s for Etherscan indexing...");
    await new Promise((r) => setTimeout(r, 30000));
    const toVerify = [
      { address: registryAddr, args: [] },
      { address: loggerAddr, args: [kmsGateway] },
      { address: cpeAddr, args: [] },
      { address: gatewayAddr, args: [cpeAddr, 10] },
      { address: vaultAddr, args: [gatewayAddr] },
      { address: factoryAddr, args: [] },
      { address: daoAddr, args: [gatewayAddr, deployer.address] },
    ];
    for (const v of toVerify) {
      try {
        await run("verify:verify", { address: v.address, constructorArguments: v.args });
      } catch {
        console.log(`    ~ Failed to verify: ${v.address}`);
      }
    }
  }
}

main().catch(console.error);
