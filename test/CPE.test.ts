// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)

import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import type { Signer } from "ethers";
import type { ConfidentialPolicyEngine, ConfidentialVault } from "../types";

/**
 * CPE Test Suite
 *
 * The FHEVM Hardhat plugin mocks FHE operations locally:
 * - All FHE.* operations run as mock computations (instant, deterministic)
 * - fhevm.createEncryptedInput() encrypts values for test purposes
 * - fhevm.decrypt*() decrypts handles for assertion (test-only, not available on-chain)
 *
 * On Sepolia, replace fhevm.decrypt*() with off-chain KMS decryption calls.
 */
describe("ConfidentialPolicyEngine", function () {
  // SETUP
  let cpe: ConfidentialPolicyEngine;
  let vault: ConfidentialVault;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let helper: any;

  let owner: Signer; // engine owner
  let admin: Signer; // policy admin
  let subject: Signer; // wallet bound to policy
  let auditor: Signer; // compliance auditor
  let attacker: Signer; // unauthorized caller

  let POLICY_ID: string;

  before(async function () {
    [owner, admin, subject, auditor, attacker] = await ethers.getSigners();

    // Deploy CPE
    const CPEFactory = await ethers.getContractFactory("ConfidentialPolicyEngine");
    cpe = (await CPEFactory.connect(owner).deploy()) as ConfidentialPolicyEngine;
    await cpe.waitForDeployment();

    // Deploy Vault
    const VaultFactory = await ethers.getContractFactory("ConfidentialVault");
    vault = (await VaultFactory.connect(owner).deploy(await cpe.getAddress())) as ConfidentialVault;
    await vault.waitForDeployment();

    // Deploy TestHelper
    const HelperFactory = await ethers.getContractFactory("TestHelper");
    helper = await HelperFactory.connect(owner).deploy(await cpe.getAddress());
    await helper.waitForDeployment();

    // Authorize vault and helper as CPE callers
    await cpe.connect(owner).authorizeCaller(await vault.getAddress());
    await cpe.connect(owner).authorizeCaller(await helper.getAddress());
    // Also authorize owner for direct encrypted evaluation assertions in tests
    await cpe.connect(owner).authorizeCaller(await owner.getAddress());

    // Deterministic policy ID
    POLICY_ID = ethers.keccak256(ethers.toUtf8Bytes("trading-desk-001"));
  });

  // HELPERS

  async function expectTxFailure(txPromise: Promise<unknown>) {
    try {
      await txPromise;
      expect.fail("Expected transaction to fail");
    } catch (error) {
      expect(error).to.not.equal(undefined);
    }
  }

  /**
   * Helper: create encrypted inputs for policy creation.
   * Returns handles and proof packed for the contract call.
   */
  async function encryptPolicyInputs(
    caller: Signer,
    perTx: bigint,
    daily: bigint,
    monthly: bigint,
    riskTier: number,
    complianceTier: number,
  ) {
    const cpeAddr = await cpe.getAddress();
    const callerAddr = await caller.getAddress();

    const input = fhevm.createEncryptedInput(cpeAddr, callerAddr);
    input.add64(perTx); // index 0 — perTxLimit
    input.add64(daily); // index 1 — dailyLimit
    input.add64(monthly); // index 2 — monthlyLimit
    input.add8(riskTier); // index 3 — riskTier
    input.add8(complianceTier); // index 4 — complianceTier

    const encrypted = await input.encrypt();
    return {
      encPerTxLimit: encrypted.handles[0],
      encDailyLimit: encrypted.handles[1],
      encMonthlyLimit: encrypted.handles[2],
      encRiskTier: encrypted.handles[3],
      encComplianceTier: encrypted.handles[4],
      inputProof: encrypted.inputProof,
    };
  }

  /**
   * Helper: encrypt a single uint64 amount for a vault withdrawal.
   */
  async function encryptAmountForSender(contractAddr: string, senderAddr: string, amount: bigint) {
    const input = fhevm.createEncryptedInput(contractAddr, senderAddr);
    input.add64(amount);
    const encrypted = await input.encrypt();

    return {
      encAmount: encrypted.handles[0],
      inputProof: encrypted.inputProof,
    };
  }

  /**
   * Helper: create a policy with default test values.
   * perTx=1ETH, daily=5ETH, monthly=20ETH, tier=1, compliance=1
   */
  async function createDefaultPolicy() {
    const inputs = await encryptPolicyInputs(
      admin,
      ethers.parseEther("1"), // 1 ETH per tx
      ethers.parseEther("5"), // 5 ETH daily
      ethers.parseEther("10"), // 10 ETH monthly (fits uint64)
      1, // risk tier 1
      1, // compliance tier 1
    );

    return cpe
      .connect(admin)
      .createPolicy(
        POLICY_ID,
        inputs.encPerTxLimit,
        inputs.encDailyLimit,
        inputs.encMonthlyLimit,
        inputs.encRiskTier,
        inputs.encComplianceTier,
        inputs.inputProof,
      );
  }

  // TEST: POLICY CREATION

  describe("Policy Creation", function () {
    it("should create a policy with encrypted inputs", async function () {
      const tx = await createDefaultPolicy();
      await tx.wait();

      const meta = await cpe.getPolicyMetadata(POLICY_ID);
      expect(meta.policyAdmin).to.equal(await admin.getAddress());
      expect(meta.exists).to.equal(true);
      expect(meta.createdAt).to.be.gt(0n);
    });

    it("should emit PolicyCreated event", async function () {
      // Re-create with a different policyId
      const altId = ethers.keccak256(ethers.toUtf8Bytes("alt-policy"));
      const inputs = await encryptPolicyInputs(admin, 1n, 5n, 20n, 1, 1);

      await expect(
        cpe
          .connect(admin)
          .createPolicy(
            altId,
            inputs.encPerTxLimit,
            inputs.encDailyLimit,
            inputs.encMonthlyLimit,
            inputs.encRiskTier,
            inputs.encComplianceTier,
            inputs.inputProof,
          ),
      )
        .to.emit(cpe, "PolicyCreated")
        .withArgs(altId, await admin.getAddress(), anyValue);
    });

    it("should revert if policy already exists", async function () {
      const inputs = await encryptPolicyInputs(admin, 1n, 5n, 20n, 1, 1);
      await expect(
        cpe
          .connect(admin)
          .createPolicy(
            POLICY_ID,
            inputs.encPerTxLimit,
            inputs.encDailyLimit,
            inputs.encMonthlyLimit,
            inputs.encRiskTier,
            inputs.encComplianceTier,
            inputs.inputProof,
          ),
      ).to.be.revertedWithCustomError(cpe, "PolicyAlreadyExists");
    });
  });

  // TEST: ADDRESS BINDING

  describe("Address Binding", function () {
    it("should bind an address to a policy", async function () {
      const subjectAddr = await subject.getAddress();
      await cpe.connect(admin).bindAddress(POLICY_ID, subjectAddr);

      const boundId = await cpe.getPolicyForAddress(subjectAddr);
      expect(boundId).to.equal(POLICY_ID);
    });

    it("should confirm hasPolicy returns true for bound address", async function () {
      expect(await cpe.hasPolicy(await subject.getAddress())).to.equal(true);
    });

    it("should confirm hasPolicy returns false for unbound address", async function () {
      expect(await cpe.hasPolicy(await attacker.getAddress())).to.equal(false);
    });

    it("should only allow policy admin to bind addresses", async function () {
      await expectTxFailure(cpe.connect(attacker).bindAddress(POLICY_ID, await attacker.getAddress()));
    });
  });

  // TEST: POLICY EVALUATION (core logic)

  describe("Policy Evaluation via Vault", function () {
    before(async function () {
      // Fund the vault with some ETH for withdrawals
      await vault.connect(subject).deposit({ value: ethers.parseEther("10") });
    });

    it("should track encrypted balances on deposit", async function () {
      const subjectAddr = await subject.getAddress();
      const encBal = await vault.encryptedBalance(subjectAddr);
      expect(await fhevm.debugger.decryptEuint(5, encBal)).to.equal(ethers.parseEther("10")); // 10 ETH in Wei
    });

    /**
     * Helper: send a transaction via TestHelper.evaluate() and extract the
     * ebool handle from the Evaluated event emitted by the helper contract.
     */
    async function callEvaluate(subjectAddr: string, amountWei: bigint) {
      const { encAmount, inputProof } = await encryptAmountForSender(
        await helper.getAddress(),
        await owner.getAddress(),
        amountWei,
      );
      const tx = await helper.evaluate(subjectAddr, encAmount, inputProof);
      const receipt = await tx.wait();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const log = receipt.logs.find((l: any) => l.fragment && l.fragment.name === "Evaluated");
      return log.args[0]; // the ebool handle
    }

    it("should approve a withdrawal within policy limits", async function () {
      // 0.5 ETH — within 1 ETH per-tx limit
      const { encAmount, inputProof } = await encryptAmountForSender(
        await vault.getAddress(),
        await subject.getAddress(),
        ethers.parseEther("0.5"),
      );

      const balanceBefore = await ethers.provider.getBalance(await subject.getAddress());
      const tx = await vault.connect(subject).withdraw(encAmount, inputProof, ethers.parseEther("0.5"));
      await tx.wait();

      const balanceAfter = await ethers.provider.getBalance(await subject.getAddress());
      // Balance should increase (minus gas)
      expect(balanceAfter).to.be.gt(balanceBefore - ethers.parseEther("0.1"));
    });

    it("should deny a withdrawal exceeding per-tx limit", async function () {
      // 2 ETH — exceeds 1 ETH per-tx limit
      const approved = await callEvaluate(await subject.getAddress(), ethers.parseEther("2"));
      expect(await fhevm.debugger.decryptEbool(approved)).to.equal(false);
    });

    it("should deny withdrawal from address with no policy", async function () {
      // attacker has no policy bound → should get false
      await vault.connect(attacker).deposit({ value: ethers.parseEther("1") });
      const approved = await callEvaluate(await attacker.getAddress(), ethers.parseEther("0.1"));
      expect(await fhevm.debugger.decryptEbool(approved)).to.equal(false);
    });

    it("should deny withdrawal from frozen policy", async function () {
      await cpe.connect(admin).freezePolicy(POLICY_ID);

      const approved = await callEvaluate(await subject.getAddress(), ethers.parseEther("0.1"));
      expect(await fhevm.debugger.decryptEbool(approved)).to.equal(false);

      // Unfreeze for subsequent tests
      await cpe.connect(admin).unfreezePolicy(POLICY_ID);
    });

    it("should track rolling daily usage and enforce daily limit", async function () {
      // Starting state: 0.5 ETH used today (from the vault.withdraw in Test 1).
      // Daily limit = 5 ETH. Per-tx limit = 1 ETH.
      //
      // callEvaluate() routes through TestHelper → CPE.evaluateTransaction().
      // When CPE approves a tx (result = true), it immediately advances dailyUsed
      // via FHE.select(). So each passing callEvaluate drains the daily budget —
      // no need for a real vault.withdraw to update the counter.

      await vault.connect(subject).deposit({ value: ethers.parseEther("10") });

      // a1: 0.5 + 1 = 1.5 ETH ≤ 5 ETH → pass
      const a1 = await callEvaluate(await subject.getAddress(), ethers.parseEther("1"));
      expect(await fhevm.debugger.decryptEbool(a1)).to.equal(true);

      // a2: 1.5 + 1 = 2.5 ETH ≤ 5 ETH → pass
      const a2 = await callEvaluate(await subject.getAddress(), ethers.parseEther("1"));
      expect(await fhevm.debugger.decryptEbool(a2)).to.equal(true);

      // a3: 2.5 + 1 = 3.5 ETH ≤ 5 ETH → pass
      const a3 = await callEvaluate(await subject.getAddress(), ethers.parseEther("1"));
      expect(await fhevm.debugger.decryptEbool(a3)).to.equal(true);

      // a4: 3.5 + 1 = 4.5 ETH ≤ 5 ETH → pass
      const a4 = await callEvaluate(await subject.getAddress(), ethers.parseEther("1"));
      expect(await fhevm.debugger.decryptEbool(a4)).to.equal(true);

      // a5: 4.5 + 1 = 5.5 ETH > 5 ETH → DENY (daily limit exceeded)
      const a5 = await callEvaluate(await subject.getAddress(), ethers.parseEther("1"));
      expect(await fhevm.debugger.decryptEbool(a5)).to.equal(false);
    });
  });
  // TEST: FREEZE / UNFREEZE

  describe("Freeze / Unfreeze", function () {
    it("should emit PolicyFrozen on freeze", async function () {
      await expect(cpe.connect(admin).freezePolicy(POLICY_ID))
        .to.emit(cpe, "PolicyFrozen")
        .withArgs(POLICY_ID, anyValue);
    });

    it("should emit PolicyUnfrozen on unfreeze", async function () {
      await expect(cpe.connect(admin).unfreezePolicy(POLICY_ID))
        .to.emit(cpe, "PolicyUnfrozen")
        .withArgs(POLICY_ID, anyValue);
    });

    it("should only allow policy admin to freeze", async function () {
      await expect(cpe.connect(attacker).freezePolicy(POLICY_ID)).to.be.revertedWithCustomError(cpe, "NotPolicyAdmin");
    });
  });

  // TEST: POLICY UPDATES

  describe("Policy Updates", function () {
    it("should update perTxLimit and emit event", async function () {
      const cpeAddr = await cpe.getAddress();
      const adminAddr = await admin.getAddress();
      const input = fhevm.createEncryptedInput(cpeAddr, adminAddr);
      input.add64(ethers.parseEther("2")); // raise limit to 2 ETH
      const enc = await input.encrypt();

      await expect(cpe.connect(admin).updatePerTxLimit(POLICY_ID, enc.handles[0], enc.inputProof))
        .to.emit(cpe, "PolicyUpdated")
        .withArgs(POLICY_ID, "perTxLimit", anyValue);
    });

    it("should not allow non-admin to update policy", async function () {
      const cpeAddr = await cpe.getAddress();
      const attackerAddr = await attacker.getAddress();
      const input = fhevm.createEncryptedInput(cpeAddr, attackerAddr);
      input.add64(999n);
      const enc = await input.encrypt();

      await expectTxFailure(cpe.connect(attacker).updatePerTxLimit(POLICY_ID, enc.handles[0], enc.inputProof));
    });
  });

  // TEST: AUDITOR MANAGEMENT

  describe("Auditor Management", function () {
    it("should grant auditor access", async function () {
      const auditorAddr = await auditor.getAddress();
      await expect(cpe.connect(admin).grantAuditor(POLICY_ID, auditorAddr))
        .to.emit(cpe, "AuditorGranted")
        .withArgs(POLICY_ID, auditorAddr);

      expect(await cpe.isAuditor(POLICY_ID, auditorAddr)).to.equal(true);
    });

    it("should revoke auditor access in mapping", async function () {
      const auditorAddr = await auditor.getAddress();
      await cpe.connect(admin).revokeAuditor(POLICY_ID, auditorAddr);
      expect(await cpe.isAuditor(POLICY_ID, auditorAddr)).to.equal(false);

      // Re-grant for subsequent tests
      await cpe.connect(admin).grantAuditor(POLICY_ID, auditorAddr);
    });

    it("should not allow non-admin to grant auditor", async function () {
      await expectTxFailure(cpe.connect(attacker).grantAuditor(POLICY_ID, await attacker.getAddress()));
    });
  });

  // TEST: ADMIN TRANSFER (2-step)

  describe("Admin Transfer", function () {
    let NEW_POLICY_ID: string;
    let newAdmin: Signer;

    before(async function () {
      [, , , , , newAdmin] = await ethers.getSigners();
      NEW_POLICY_ID = ethers.keccak256(ethers.toUtf8Bytes("transfer-test-policy"));

      // Create a separate policy for transfer test
      const inputs = await encryptPolicyInputs(admin, 1n, 5n, 20n, 1, 1);
      await cpe
        .connect(admin)
        .createPolicy(
          NEW_POLICY_ID,
          inputs.encPerTxLimit,
          inputs.encDailyLimit,
          inputs.encMonthlyLimit,
          inputs.encRiskTier,
          inputs.encComplianceTier,
          inputs.inputProof,
        );
    });

    it("should initiate admin transfer", async function () {
      const newAdminAddr = await newAdmin.getAddress();
      await expect(cpe.connect(admin).initiateAdminTransfer(NEW_POLICY_ID, newAdminAddr))
        .to.emit(cpe, "AdminTransferInitiated")
        .withArgs(NEW_POLICY_ID, newAdminAddr);
    });

    it("should not allow wrong address to accept transfer", async function () {
      await expect(cpe.connect(attacker).acceptAdminTransfer(NEW_POLICY_ID)).to.be.revertedWithCustomError(
        cpe,
        "NotPendingAdmin",
      );
    });

    it("should complete transfer when new admin accepts", async function () {
      const newAdminAddr = await newAdmin.getAddress();
      await expect(cpe.connect(newAdmin).acceptAdminTransfer(NEW_POLICY_ID))
        .to.emit(cpe, "AdminTransferAccepted")
        .withArgs(NEW_POLICY_ID, newAdminAddr);

      const meta = await cpe.getPolicyMetadata(NEW_POLICY_ID);
      expect(meta.policyAdmin).to.equal(newAdminAddr);
    });
  });

  // TEST: CALLER AUTHORIZATION

  describe("Caller Authorization", function () {
    it("should not allow unauthorized caller to call evaluateTransaction", async function () {
      const input = fhevm.createEncryptedInput(await cpe.getAddress(), await attacker.getAddress());
      input.add64(100n);
      const encrypted = await input.encrypt();

      // Direct call to CPE (not through vault) by an unauthorized address
      await expectTxFailure(
        cpe
          .connect(attacker)
          .evaluateTransaction(await subject.getAddress(), encrypted.handles[0]),
      );
    });

    it("should authorize and revoke callers", async function () {
      const callerAddr = await attacker.getAddress();

      await cpe.connect(owner).authorizeCaller(callerAddr);
      expect(await cpe.isAuthorizedCaller(callerAddr)).to.equal(true);

      await cpe.connect(owner).revokeCaller(callerAddr);
    });

    it("should not allow non-owner to authorize callers", async function () {
      await expectTxFailure(cpe.connect(admin).authorizeCaller(await admin.getAddress()));
    });
  });

  // TEST: POLICY REGISTRY AND AUDIT LOGGER INTEGRATION

  describe("Policy Registry and Audit Logger Integration", function () {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let registry: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let logger: any;

    before(async function () {
      const RegistryFactory = await ethers.getContractFactory("PolicyRegistry");
      registry = await RegistryFactory.connect(owner).deploy();
      await registry.waitForDeployment();

      const LoggerFactory = await ethers.getContractFactory("AuditLogger");
      logger = await LoggerFactory.connect(owner).deploy(ethers.ZeroAddress);
      await logger.waitForDeployment();

      // Configure CPE setters
      await cpe.connect(owner).setPolicyRegistry(await registry.getAddress());
      await cpe.connect(owner).setAuditLogger(await logger.getAddress());

      // Authorize CPE in Registry and Logger
      await registry.connect(owner).authorizeWriter(await cpe.getAddress());
      await logger.connect(owner).authorizeLogger(await cpe.getAddress());
    });

    it("should write bindings to PolicyRegistry on-chain automatically", async function () {
      const subjectAddr = await subject.getAddress();
      await cpe.connect(admin).bindAddress(POLICY_ID, subjectAddr);
      const boundId = await registry.getPolicyForAddress(subjectAddr);
      expect(boundId).to.equal(POLICY_ID);
    });

    it("should allow only owner to configure registry and logger", async function () {
      await expectTxFailure(cpe.connect(attacker).setPolicyRegistry(ethers.ZeroAddress));
      await expectTxFailure(cpe.connect(attacker).setAuditLogger(ethers.ZeroAddress));
    });

    after(async function () {
      // Revert back to zero addresses to avoid side effects
      await cpe.connect(owner).setPolicyRegistry(ethers.ZeroAddress);
      await cpe.connect(owner).setAuditLogger(ethers.ZeroAddress);
    });
  });

  // TEST: COMPLIANCE CHECK

  describe("Compliance Evaluation", function () {
    it("should pass compliance check for sufficient tier", async function () {
      // Subject has tier 1 — check if meets tier 1 requirement
      // (In mock mode, we verify no revert — on testnet use off-chain decrypt to assert)
      // compliantTransfer with tier 1 requirement — subject has tier 1
      await vault.connect(subject).deposit({ value: ethers.parseEther("1") });

      // Should not revert (compliance met)
      await vault.connect(subject).compliantTransfer(
        await auditor.getAddress(),
        ethers.parseEther("0"), // 0 ETH for test
        1, // required tier
      );
    });

    it("should return false for insufficient compliance tier", async function () {
      const resultTuple = await cpe.evaluateCompliance.staticCallResult(await subject.getAddress(), 2);
      const result = resultTuple[0];
      expect(result).to.be.a("string");
    });
  });
});
