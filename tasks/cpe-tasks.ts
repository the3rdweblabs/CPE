// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)

// tasks/cpe-tasks.ts
import { task } from "hardhat/config";
import * as fs from "fs";

/// helper to load deployments from deploy/deployments.{network}.json
function loadDeployments() {
  const path = "./deploy/deployments.sepolia.json";
  if (!fs.existsSync(path)) throw new Error("No deployments.sepolia.json — run deploy:sepolia first");
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

/// task:wallet
// Check your wallet address and balance
task("task:wallet", "Show deployer address and Sepolia balance").setAction(async (_, hre) => {
  const { ethers } = hre;
  const [signer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(signer.address);
  console.log("Address :", signer.address);
  console.log("Balance :", ethers.formatEther(balance), "ETH");
});

/// task:create-policy from deploy/deployments.{network}.json
// Create an encrypted policy on Sepolia
task("task:create-policy", "Create an encrypted CPE policy on Sepolia")
  .addParam("name", "Policy name (used to generate policyId)")
  .setAction(async (args, hre) => {
    const { ethers, fhevm } = hre;

    // CRITICAL: this initialises the plugin against the live Sepolia relayer
    await fhevm.initializeCLIApi();

    const deployments = loadDeployments();
    const [admin] = await ethers.getSigners();
    const cpe = await ethers.getContractAt("ConfidentialPolicyEngine", deployments.contracts.ConfidentialPolicyEngine);

    const policyId = ethers.keccak256(ethers.toUtf8Bytes(args.name));
    const cpeAddr = await cpe.getAddress();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cpeAny = cpe as any;

    console.log("Creating policy:", args.name);
    console.log("PolicyId:", policyId);
    console.log("Admin:", admin.address);

    // Store limits in Gwei (1 ETH = 1,000,000,000 Gwei)
    // This gives us a max of ~18 ETH representable, plenty for testing
    const ONE_ETH_IN_GWEI = 1_000_000_000n; // 1e9
    const perTxLimit = ONE_ETH_IN_GWEI * 1n; // 1 ETH in Gwei
    const dailyLimit = ONE_ETH_IN_GWEI * 5n; // 5 ETH in Gwei
    const monthlyLimit = ONE_ETH_IN_GWEI * 10n; // 10 ETH in Gwei

    const input = fhevm.createEncryptedInput(cpeAddr, admin.address);
    input.add64(perTxLimit);
    input.add64(dailyLimit);
    input.add64(monthlyLimit);
    input.add8(1); // riskTier
    input.add8(1); // complianceTier
    const enc = await input.encrypt();

    // Simulate the call first to capture any revert reason without sending a transaction
    try {
      // Prefer provider.call with populated transaction when available
      if (cpeAny.populateTransaction && typeof cpeAny.populateTransaction.createPolicy === "function") {
        const populated = await cpeAny.populateTransaction.createPolicy(
          policyId,
          enc.handles[0],
          enc.handles[1],
          enc.handles[2],
          enc.handles[3],
          enc.handles[4],
          enc.inputProof,
        );
        await ethers.provider.call({ to: populated.to!, data: populated.data!, from: admin.address });
      } else if (cpeAny.callStatic && typeof cpeAny.callStatic.createPolicy === "function") {
        // Fallback to callStatic if populateTransaction isn't present on this contract object
        await cpeAny.callStatic.createPolicy(
          policyId,
          enc.handles[0],
          enc.handles[1],
          enc.handles[2],
          enc.handles[3],
          enc.handles[4],
          enc.inputProof,
        );
      } else {
        console.warn("Unable to simulate: contract helpers missing. Contract object keys:", Object.keys(cpe));
        console.warn("Skipping simulation and proceeding to gas estimate / transaction.");
      }
    } catch (simErr: unknown) {
      console.error("Simulation failed — revert reason / error:", simErr);
      console.error("Tip: check that fhevm.initializeCLIApi() completed and your relayer credentials are valid.");
      throw simErr;
    }

    // Build calldata for createPolicy
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const iface = cpeAny.interface as any;
    const calldata = iface.encodeFunctionData("createPolicy", [
      policyId,
      enc.handles[0],
      enc.handles[1],
      enc.handles[2],
      enc.handles[3],
      enc.handles[4],
      enc.inputProof,
    ]);

    // Estimate gas (prefer contract helper, otherwise provider estimate)
    try {
      if (cpeAny.estimateGas && typeof cpeAny.estimateGas.createPolicy === "function") {
        const gasEstimate = await cpeAny.estimateGas.createPolicy(
          policyId,
          enc.handles[0],
          enc.handles[1],
          enc.handles[2],
          enc.handles[3],
          enc.handles[4],
          enc.inputProof,
        );
        console.log("Estimated gas for createPolicy:", gasEstimate.toString());
      } else {
        const gasEstimate = await ethers.provider.estimateGas({ to: cpeAddr, data: calldata });
        console.log("Estimated gas for createPolicy (provider):", gasEstimate.toString());
      }
    } catch (estErr: unknown) {
      console.warn("Gas estimate failed:", estErr);
    }

    // Send transaction using signer directly to ensure proper from/to/data handling
    const signer = admin;
    try {
      const txResponse = await signer.sendTransaction({ to: cpeAddr, data: calldata });
      const receipt = await txResponse.wait();
      console.log("✓ Policy created!");
      console.log("  Gas used:", receipt!.gasUsed.toString());
      console.log("  Tx hash :", receipt!.hash);
      console.log("  Etherscan: https://sepolia.etherscan.io/tx/" + receipt!.hash);
    } catch (txErr: unknown) {
      console.error("Transaction failed:", txErr);
      throw txErr;
    }
  });

// task:bind-address from deploy/deployments.{network}.json
task("task:bind-address", "Bind a wallet address to a policy")
  .addParam("name", "Policy name (same as used in create-policy)")
  .addParam("subject", "Wallet address to bind (default: your own)", "self")
  .setAction(async (args, hre) => {
    const { ethers } = hre;
    const deployments = loadDeployments();
    const [admin] = await ethers.getSigners();
    const cpe = await ethers.getContractAt("ConfidentialPolicyEngine", deployments.contracts.ConfidentialPolicyEngine);

    const policyId = ethers.keccak256(ethers.toUtf8Bytes(args.name));
    const subject = args.subject === "self" ? admin.address : args.subject;

    const tx = await cpe.bindAddress(policyId, subject, { gasLimit: 100_000 });
    const receipt = await tx.wait();
    console.log("✓ Address bound:", subject, "→", args.name);
    console.log("  Tx:", receipt!.hash);
  });

// task:policy-info from deploy/deployments.{network}.json
task("task:policy-info", "Read plaintext policy metadata")
  .addParam("name", "Policy name")
  .setAction(async (args, hre) => {
    const { ethers } = hre;
    const deployments = loadDeployments();
    const cpe = await ethers.getContractAt("ConfidentialPolicyEngine", deployments.contracts.ConfidentialPolicyEngine);

    const policyId = ethers.keccak256(ethers.toUtf8Bytes(args.name));
    const meta = await cpe.getPolicyMetadata(policyId);

    console.log("Policy:", args.name);
    console.log("  ID         :", policyId);
    console.log("  Admin      :", meta.policyAdmin);
    console.log("  Exists     :", meta.exists);
    console.log("  Created    :", new Date(Number(meta.createdAt) * 1000).toISOString());
    console.log("  Updated    :", new Date(Number(meta.updatedAt) * 1000).toISOString());
    console.log("  Daily reset:", new Date(Number(meta.dailyResetAt) * 1000).toISOString());

    const [admin] = await ethers.getSigners();
    const hasPolicy = await cpe.hasPolicy(admin.address);
    console.log("  Your wallet has policy:", hasPolicy);
  });

// task:deposit from deploy/deployments.{network}.json
task("task:deposit", "Deposit ETH into the ConfidentialVault")
  .addParam("amount", "Amount in ETH (e.g. 0.05)")
  .setAction(async (args, hre) => {
    const { ethers } = hre;
    const deployments = loadDeployments();
    const vault = await ethers.getContractAt("ConfidentialVault", deployments.contracts.ConfidentialVault);

    const tx = await vault.deposit({
      value: ethers.parseEther(args.amount),
      gasLimit: 100_000,
    });
    const receipt = await tx.wait();
    console.log("✓ Deposited", args.amount, "ETH to vault");
    console.log("  Tx:", receipt!.hash);
  });

// task:withdraw from deploy/deployments.{network}.json
task("task:withdraw", "Attempt a policy-gated withdrawal from the vault")
  .addParam("amount", "Amount in ETH (e.g. 0.01)")
  .setAction(async (args, hre) => {
    const { ethers, fhevm } = hre;

    // CRITICAL: initialise plugin against Sepolia relayer before encrypting
    await fhevm.initializeCLIApi();

    const deployments = loadDeployments();
    const [signer] = await ethers.getSigners();

    const vault = await ethers.getContractAt("ConfidentialVault", deployments.contracts.ConfidentialVault);

    const cpe = await ethers.getContractAt("ConfidentialPolicyEngine", deployments.contracts.ConfidentialPolicyEngine);

    const vaultAddr = await vault.getAddress();
    const cpeAddr = await cpe.getAddress();

    // Convert ETH input to:
    // - Gwei for encrypted policy check
    // - Wei  for actual ETH transfer
    const clearAmountWei = ethers.parseEther(args.amount); // ETH -> Wei
    const clearAmountGwei = clearAmountWei / 1_000_000_000n; // Wei -> Gwei

    console.log("Withdraw debug:");
    console.log("  CPE address   :", cpeAddr);
    console.log("  Vault address :", vaultAddr);
    console.log("  Signer        :", signer.address);
    console.log("  Amount (ETH)  :", args.amount);
    console.log("  Amount (Wei)  :", clearAmountWei.toString());
    console.log("  Amount (Gwei) :", clearAmountGwei.toString());

    // IMPORTANT:
    // Encrypt for the contract that verifies the proof / materializes the handle.
    // That is the CPE (evaluateTransaction), NOT the Vault.
    console.log("Encrypting withdrawal amount (for CPE verifier)...");
    const input = fhevm.createEncryptedInput(cpeAddr, signer.address);
    input.add64(clearAmountGwei); // encrypted in Gwei (matches policy unit)
    const enc = await input.encrypt();

    console.log("Submitting withdrawal...");
    try {
      const tx = await vault.withdraw(
        enc.handles[0],
        enc.inputProof,
        clearAmountWei, // actual ETH transfer still in Wei
        { gasLimit: 500_000 },
      );
      const receipt = await tx.wait();
      console.log("✓ Withdrawal APPROVED — policy passed!");
      console.log("  Gas used:", receipt!.gasUsed.toString());
      console.log("  Tx:", "https://sepolia.etherscan.io/tx/" + receipt!.hash);
    } catch (err: unknown) {
      console.log("✗ Withdrawal DENIED — FHE.req() reverted (policy blocked it)");
      if (err instanceof Error) {
        console.log("  Error:", err.message);
      } else {
        console.log("  Error:", String(err));
      }
    }
  });

// task:freeze
task("task:freeze", "Silently freeze a policy")
  .addParam("name", "Policy name")
  .setAction(async (args, hre) => {
    const { ethers } = hre;
    const deployments = loadDeployments();
    const cpe = await ethers.getContractAt("ConfidentialPolicyEngine", deployments.contracts.ConfidentialPolicyEngine);

    const policyId = ethers.keccak256(ethers.toUtf8Bytes(args.name));
    const tx = await cpe.freezePolicy(policyId, { gasLimit: 150_000 });
    const receipt = await tx.wait();
    console.log("✓ Policy frozen (silently — indistinguishable from any state write)");
    console.log("  Tx:", receipt!.hash);
  });

// task:unfreeze from deploy/deployments.{network}.json
task("task:unfreeze", "Unfreeze a policy")
  .addParam("name", "Policy name")
  .setAction(async (args, hre) => {
    const { ethers } = hre;
    const deployments = loadDeployments();
    const cpe = await ethers.getContractAt("ConfidentialPolicyEngine", deployments.contracts.ConfidentialPolicyEngine);

    const policyId = ethers.keccak256(ethers.toUtf8Bytes(args.name));
    const tx = await cpe.unfreezePolicy(policyId, { gasLimit: 150_000 });
    const receipt = await tx.wait();
    console.log("✓ Policy unfrozen");
    console.log("  Tx:", receipt!.hash);
  });
