// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)

import { task } from "hardhat/config";
import * as fs from "fs";

/**
 * HELPERS
 */

function loadDeployments() {
  const path = "./deploy/deployments.sepolia.json";
  if (!fs.existsSync(path)) throw new Error("No deployments.sepolia.json — run deploy:sepolia first");
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

/**
 * SECTION 1: INFRASTRUCTURE CHECKS
 */

task("task:wallet", "Show deployer address and Sepolia balance").setAction(async (_, hre) => {
  const { ethers } = hre;
  const [signer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(signer.address);
  console.log("Wallet Address:", signer.address);
  console.log("Sepolia Balance:", ethers.formatEther(balance), "ETH");
});

/**
 * SECTION 2: CORE POLICY SETUP
 */

task("task:create-policy", "Create a new encrypted policy in the CPE")
  .addParam("name", "The unique name/alias for this policy (plaintext metadata)")
  .setAction(async (args, hre) => {
    const { ethers, fhevm } = hre;
    await fhevm.initializeCLIApi();
    const deployments = loadDeployments();
    const cpe = await ethers.getContractAt("ConfidentialPolicyEngine", deployments.contracts.ConfidentialPolicyEngine);

    const policyId = ethers.keccak256(ethers.toUtf8Bytes(args.name));
    const [admin] = await ethers.getSigners();

    console.log("Creating policy:", args.name);
    console.log("PolicyId:", policyId);
    console.log("Admin:", admin.address);

    console.log("Generating encrypted policy inputs...");
    const input = fhevm.createEncryptedInput(deployments.contracts.ConfidentialPolicyEngine, admin.address);
    input.add64(1_000_000_000n); // perTxLimit: 1 ETH (in Gwei)
    input.add64(5_000_000_000n); // dailyLimit: 5 ETH
    input.add64(20_000_000_000n); // monthlyLimit: 20 ETH
    input.add8(1); // riskTier: 1
    input.add8(1); // complianceTier: 1
    const enc = await input.encrypt();

    // Estimate gas
    const iface = cpe.interface;
    const calldata = iface.encodeFunctionData("createPolicy", [
      policyId,
      enc.handles[0],
      enc.handles[1],
      enc.handles[2],
      enc.handles[3],
      enc.handles[4],
      enc.inputProof
    ]);
    const gasEstimate = await ethers.provider.estimateGas({ to: deployments.contracts.ConfidentialPolicyEngine, data: calldata });
    console.log("Estimated gas for createPolicy:", gasEstimate.toString());

    const tx = await cpe.createPolicy(
      policyId,
      enc.handles[0],
      enc.handles[1],
      enc.handles[2],
      enc.handles[3],
      enc.handles[4],
      enc.inputProof
    );
    const receipt = await tx.wait();
    console.log("✓ Policy created successfully!");
    console.log("  Gas used:", receipt!.gasUsed.toString());
    console.log("  Tx hash :", receipt!.hash);
    console.log("  Etherscan: https://sepolia.etherscan.io/tx/" + receipt!.hash);
  });

task("task:bind-address", "Bind a wallet address to an existing policy")
  .addParam("name", "The policy name to bind to")
  .addOptionalParam("subject", "The address to bind (defaults to self)")
  .setAction(async (args, hre) => {
    const { ethers } = hre;
    const deployments = loadDeployments();
    const cpe = await ethers.getContractAt("ConfidentialPolicyEngine", deployments.contracts.ConfidentialPolicyEngine);
    const [signer] = await ethers.getSigners();

    const subject = args.subject === "self" || !args.subject ? signer.address : args.subject;
    const policyId = ethers.keccak256(ethers.toUtf8Bytes(args.name));

    console.log(`Binding ${subject} to policy ${args.name}...`);
    const tx = await cpe.bindAddress(policyId, subject);
    await tx.wait();
    console.log("✓ Address bound successfully");
  });

task("task:policy-info", "Check if an address is bound and view policy metadata")
  .addOptionalParam("address", "The address to check (defaults to self)")
  .setAction(async (args, hre) => {
    const { ethers } = hre;
    const deployments = loadDeployments();
    const cpe = await ethers.getContractAt("ConfidentialPolicyEngine", deployments.contracts.ConfidentialPolicyEngine);
    const [signer] = await ethers.getSigners();

    const subject = args.address || signer.address;
    const hasPol = await cpe.hasPolicy(subject);

    console.log("Subject:", subject);
    console.log("Has Active Policy:", hasPol ? "YES" : "NO");

    if (hasPol) {
      const policyId = await cpe.getPolicyForAddress(subject);
      console.log("Policy ID:", policyId);
    }
  });

/**
 * SECTION 3: EXAMPLE 1 - PERSONAL VAULT
 */

task("task:deposit", "Deposit ETH into the personal Confidential Vault")
  .addParam("amount", "Amount in ETH")
  .setAction(async (args, hre) => {
    const { ethers } = hre;
    const deployments = loadDeployments();
    const vault = await ethers.getContractAt("ConfidentialVault", deployments.contracts.ConfidentialVault);

    const amountWei = ethers.parseEther(args.amount);
    console.log(`Depositing ${args.amount} ETH to vault...`);
    const tx = await vault.deposit({ value: amountWei });
    await tx.wait();
    console.log("✓ Deposit successful");
  });

task("task:withdraw", "Withdraw ETH from personal vault (Policy-Gated)")
  .addParam("amount", "Amount in ETH")
  .setAction(async (args, hre) => {
    const { ethers, fhevm } = hre;
    await fhevm.initializeCLIApi();
    const deployments = loadDeployments();
    const vault = await ethers.getContractAt("ConfidentialVault", deployments.contracts.ConfidentialVault);
    const [signer] = await ethers.getSigners();

    const amountWei = ethers.parseEther(args.amount);
    const amountGwei = amountWei / 1_000_000_000n;

    console.log("Withdraw debug:");
    console.log("  CPE address   :", deployments.contracts.ConfidentialPolicyEngine);
    console.log("  Vault address :", deployments.contracts.ConfidentialVault);
    console.log("  Signer        :", signer.address);
    console.log("  Amount (ETH)  :", args.amount);
    console.log("  Amount (Wei)  :", amountWei.toString());
    console.log("  Amount (Gwei) :", amountGwei.toString());

    console.log("Encrypting withdrawal amount (for Vault verifier)...");
    const input = fhevm.createEncryptedInput(deployments.contracts.ConfidentialVault, signer.address);
    input.add64(amountGwei);
    const enc = await input.encrypt();

    console.log("Submitting withdrawal...");
    try {
      const tx = await vault.withdraw(enc.handles[0], enc.inputProof, amountWei);
      const receipt = await tx.wait();
      console.log("✓ Withdrawal APPROVED — policy passed!");
      console.log("  Gas used:", receipt!.gasUsed.toString());
      console.log("  Tx hash :", receipt!.hash);
      console.log("  Etherscan: https://sepolia.etherscan.io/tx/" + receipt!.hash);
    } catch {
      console.log("✗ Withdrawal DENIED by Policy Engine (Limits or Freeze active)");
    }
  });

/**
 * SECTION 4: ADMINISTRATIVE SUITE
 */

task("task:freeze", "Silently freeze a policy")
  .addParam("name", "The policy name")
  .setAction(async (args, hre) => {
    const { ethers } = hre;
    const deployments = loadDeployments();
    const cpe = await ethers.getContractAt("ConfidentialPolicyEngine", deployments.contracts.ConfidentialPolicyEngine);
    const policyId = ethers.keccak256(ethers.toUtf8Bytes(args.name));

    console.log(`Freezing policy ${args.name}...`);
    const tx = await cpe.freezePolicy(policyId);
    await tx.wait();
    console.log("✓ Policy frozen");
  });

task("task:unfreeze", "Unfreeze a policy")
  .addParam("name", "The policy name")
  .setAction(async (args, hre) => {
    const { ethers } = hre;
    const deployments = loadDeployments();
    const cpe = await ethers.getContractAt("ConfidentialPolicyEngine", deployments.contracts.ConfidentialPolicyEngine);
    const policyId = ethers.keccak256(ethers.toUtf8Bytes(args.name));

    console.log(`Unfreezing policy ${args.name}...`);
    const tx = await cpe.unfreezePolicy(policyId);
    await tx.wait();
    console.log("✓ Policy unfrozen");
  });

task("task:authorize-caller", "Authorize a contract (e.g. a new DAO) in the CPE")
  .addParam("address", "The contract address to authorize")
  .setAction(async (args, hre) => {
    const { ethers } = hre;
    const deployments = loadDeployments();
    const cpe = await ethers.getContractAt("ConfidentialPolicyEngine", deployments.contracts.ConfidentialPolicyEngine);

    console.log("Authorizing caller:", args.address);
    const tx = await cpe.authorizeCaller(args.address);
    await tx.wait();
    console.log("✓ Caller authorized in CPE");
  });

task("task:register-gateway-caller", "Register a new contract (e.g. DAO) in the CPE Gateway")
  .addParam("address", "The contract address to register")
  .addParam("name", "Label for this integration")
  .setAction(async (args, hre) => {
    const { ethers } = hre;
    const deployments = loadDeployments();
    const gateway = await ethers.getContractAt("CPEGateway", deployments.contracts.CPEGateway);

    console.log(`Registering ${args.name} (${args.address}) in Gateway...`);
    const tx = await gateway.registerCaller(args.address, args.name);
    await tx.wait();
    console.log("✓ Caller registered in Gateway");
  });

/**
 * SECTION 5: EXAMPLE 2 - INSTITUTIONAL DAO
 */

task("task:dao-create", "Deploy a new DAO institution via the Factory")
  .addParam("name", "Name of the DAO")
  .setAction(async (args, hre) => {
    const { ethers } = hre;
    const deployments = loadDeployments();
    const factory = await ethers.getContractAt("ConfidentialDAOFactory", deployments.contracts.ConfidentialDAOFactory);
    const gatewayAddr = deployments.contracts.CPEGateway;

    console.log(`Creating DAO: ${args.name}...`);
    const tx = await factory.createDAO(gatewayAddr, args.name);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const receipt = await tx.wait() as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const event = receipt.logs.find((l: any) => (l as any).fragment?.name === "DAOCreated");
    const daoAddr = event?.args[0];

    console.log("✓ DAO Created successfully!");
    console.log("DAO Address:", daoAddr);
    console.log("\nNEXT STEP: Run 'task:dao-add-member' and 'task:authorize-caller'!");
  });

task("task:dao-add-member", "Whitelist a member in a DAO treasury")
  .addParam("dao", "The DAO contract address")
  .addParam("member", "The wallet address to add")
  .setAction(async (args, hre) => {
    const { ethers } = hre;
    const dao = await ethers.getContractAt("ConfidentialDAO", args.dao);

    console.log(`Adding member ${args.member} to DAO ${args.dao}...`);
    const tx = await dao.addMember(args.member);
    await tx.wait();
    console.log("✓ Member added to DAO whitelist");
  });

task("task:dao-deposit", "Deposit shared funds into a DAO treasury")
  .addParam("dao", "The DAO contract address")
  .addParam("amount", "Amount in ETH")
  .setAction(async (args, hre) => {
    const { ethers } = hre;
    const dao = await ethers.getContractAt("ConfidentialDAO", args.dao);
    const amountWei = ethers.parseEther(args.amount);

    console.log(`Depositing ${args.amount} ETH to DAO treasury...`);
    const tx = await dao.deposit({ value: amountWei });
    await tx.wait();
    console.log("✓ Shared deposit successful");
  });

task("task:dao-withdraw", "Withdraw from a shared DAO treasury (Gated by Member Policy)")
  .addParam("dao", "The DAO contract address")
  .addParam("amount", "Amount in ETH")
  .setAction(async (args, hre) => {
    const { ethers, fhevm } = hre;
    await fhevm.initializeCLIApi();
    const dao = await ethers.getContractAt("ConfidentialDAO", args.dao);
    const [signer] = await ethers.getSigners();

    const amountWei = ethers.parseEther(args.amount);
    const amountGwei = amountWei / 1_000_000_000n;

    console.log("DAO Withdraw debug:");
    console.log("  DAO address   :", args.dao);
    console.log("  Signer        :", signer.address);
    console.log("  Amount (ETH)  :", args.amount);
    console.log("  Amount (Wei)  :", amountWei.toString());
    console.log("  Amount (Gwei) :", amountGwei.toString());

    console.log(`Requesting shared withdrawal of ${args.amount} ETH from DAO...`);
    const input = fhevm.createEncryptedInput(args.dao, signer.address);
    input.add64(amountGwei);
    const enc = await input.encrypt();

    try {
      const tx = await dao.withdraw(enc.handles[0], enc.inputProof, amountWei);
      const receipt = await tx.wait();
      console.log("✓ Shared Withdrawal APPROVED (Member Policy Passed)");
      console.log("  Gas used:", receipt!.gasUsed.toString());
      console.log("  Tx hash :", receipt!.hash);
    } catch {
      console.log("✗ Shared Withdrawal DENIED by Policy Engine");
    }
  });

task("task:compliant-transfer", "Execute a transfer gated by encrypted compliance tiers")
  .addParam("to", "Recipient address")
  .addParam("amount", "Amount in ETH")
  .addParam("tier", "Minimum compliance tier required (0-255)")
  .setAction(async (args, hre) => {
    const { ethers } = hre;
    const deployments = loadDeployments();
    const vault = await ethers.getContractAt("ConfidentialVault", deployments.contracts.ConfidentialVault);

    const amountWei = ethers.parseEther(args.amount);
    console.log(`Attempting compliant transfer of ${args.amount} ETH (Required Tier: ${args.tier})...`);

    try {
      const tx = await vault.compliantTransfer(args.to, amountWei, parseInt(args.tier));
      await tx.wait();
      console.log("✓ Transfer SUCCESSFUL (User meets compliance requirements)");
    } catch {
      console.log("✗ Transfer DENIED (User does not meet compliance tier)");
    }
  });

task("task:grant-auditor", "Grant a third party the right to audit a policy")
  .addParam("name", "The policy name")
  .addParam("auditor", "The auditor's wallet address")
  .setAction(async (args, hre) => {
    const { ethers } = hre;
    const deployments = loadDeployments();
    const cpe = await ethers.getContractAt("ConfidentialPolicyEngine", deployments.contracts.ConfidentialPolicyEngine);
    const policyId = ethers.keccak256(ethers.toUtf8Bytes(args.name));

    console.log(`Granting auditor role for ${args.name} to ${args.auditor}...`);
    const tx = await cpe.grantAuditor(policyId, args.auditor);
    await tx.wait();
    console.log("✓ Auditor role granted");
  });

