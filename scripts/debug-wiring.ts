// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)
import { ethers } from "hardhat";
import * as fs from "fs";
async function main() {
  const deployments = JSON.parse(fs.readFileSync("./deploy/deployments.sepolia.json", "utf8"));

  const gateway = await ethers.getContractAt("CPEGateway", deployments.contracts.CPEGateway);
  const vaultAddr = deployments.contracts.ConfidentialVault;

  console.log("Checking Wiring...");

  const isActive = await gateway.isActiveCaller(vaultAddr);
  console.log("Is Vault registered in Gateway?", isActive);

  if (!isActive) {
    console.log("Attempting to fix: Registering Vault in Gateway...");
    const tx = await gateway.registerCaller(vaultAddr, "ConfidentialVault");
    await tx.wait();
    console.log("Vault successfully registered!");
  }
}
main().catch(console.error);
