// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)

import { ethers, fhevm } from "hardhat";
import { expect } from "chai";

describe("Confidential DAO & Factory", function () {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let cpe: any;
  let gateway: any;
  let factory: any;
  let admin: any;
  let user1: any;
  let user2: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const ONE_ETH = ethers.parseEther("1.0");
  const TEN_ETH = ethers.parseEther("10.0");

  before(async function () {
    [admin, user1, user2] = await ethers.getSigners();

    // 1. Deploy Core CPE infrastructure
    const Registry = await ethers.getContractFactory("PolicyRegistry");
    const registry = await Registry.deploy();

    const Logger = await ethers.getContractFactory("AuditLogger");
    const logger = await Logger.deploy(ethers.ZeroAddress);

    const CPE = await ethers.getContractFactory("ConfidentialPolicyEngine");
    cpe = await CPE.deploy();

    const Gateway = await ethers.getContractFactory("CPEGateway");
    gateway = await Gateway.deploy(await cpe.getAddress(), 10);

    // 2. Wire core
    await registry.authorizeWriter(await cpe.getAddress());
    await logger.authorizeLogger(await cpe.getAddress());
    await cpe.authorizeCaller(await gateway.getAddress());

    // 3. Deploy DAO Factory
    const DAOFactory = await ethers.getContractFactory("ConfidentialDAOFactory");
    factory = await DAOFactory.deploy();
  });

  describe("DAO Factory", function () {
    it("should deploy a new DAO and set the correct owner", async function () {
      const tx = await factory.connect(user1).createDAO(await gateway.getAddress(), "User1 DAO");
      const receipt = await tx.wait();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const event = receipt.logs.find((l: any) => (l as any).fragment?.name === "DAOCreated") as any;
      const daoAddr = event.args[0];
      const daoAdmin = event.args[1];

      expect(daoAdmin).to.equal(user1.address);

      const daoContract = await ethers.getContractAt("ConfidentialDAO", daoAddr);
      expect(await daoContract.owner()).to.equal(user1.address);
    });

    it("should track all deployed DAOs for discovery", async function () {
      await factory.connect(user2).createDAO(await gateway.getAddress(), "User2 DAO");
      const allDAOs = await factory.getAllDAOs();
      expect(allDAOs.length).to.equal(2);
    });
  });

  describe("DAO Treasury Operations", function () {
    let dao: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    let daoAddr: string;
    const policyId = ethers.keccak256(ethers.toUtf8Bytes("dao-member-policy"));

    before(async function () {
      // Setup a DAO for testing
      const tx = await factory.connect(admin).createDAO(await gateway.getAddress(), "Test DAO");
      const receipt = await tx.wait();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const event = receipt.logs.find((l: any) => (l as any).fragment?.name === "DAOCreated") as any;
      daoAddr = event.args[0];
      dao = await ethers.getContractAt("ConfidentialDAO", daoAddr);

      // Authorize this DAO in CPE and Gateway
      await cpe.authorizeCaller(daoAddr);
      await gateway.registerCaller(daoAddr, "Test DAO");

      // Setup a policy for user1 (Limit: 5 ETH)
      const cpeAddr = await cpe.getAddress();
      const input = fhevm.createEncryptedInput(cpeAddr, admin.address);
      input.add64(5_000_000_000n); // 5 ETH in Gwei
      input.add64(10_000_000_000n);
      input.add64(20_000_000_000n);
      input.add8(1);
      input.add8(1);
      const enc = await input.encrypt();

      await cpe.connect(admin).createPolicy(
        policyId,
        enc.handles[0],
        enc.handles[1],
        enc.handles[2],
        enc.handles[3],
        enc.handles[4],
        enc.inputProof
      );
      await cpe.bindAddress(policyId, user1.address);
      
      // NEW: Add user1 as a member of THIS DAO
      await dao.connect(admin).addMember(user1.address);
    });

    it("should accept deposits into the shared treasury", async function () {
      await dao.connect(user2).deposit({ value: TEN_ETH });
      expect(await dao.treasuryBalance()).to.equal(TEN_ETH);

      // Balance on contract should also match
      expect(await ethers.provider.getBalance(daoAddr)).to.equal(TEN_ETH);
    });

    it("should deny withdrawal for a non-member", async function () {
      const withdrawAmt = ONE_ETH;
      const withdrawAmtGwei = 1_000_000_000n;

      const input = fhevm.createEncryptedInput(daoAddr, user2.address);
      input.add64(withdrawAmtGwei);
      const enc = await input.encrypt();

      await expect(
        dao.connect(user2).withdraw(
          enc.handles[0],
          enc.inputProof,
          withdrawAmt
        )
      ).to.be.revertedWith("ConfidentialDAO: caller is not a member");
    });

    it("should allow a member to withdraw within their encrypted quota", async function () {
      const withdrawAmt = ONE_ETH;
      const withdrawAmtGwei = 1_000_000_000n;

      const input = fhevm.createEncryptedInput(daoAddr, user1.address);
      input.add64(withdrawAmtGwei);
      const enc = await input.encrypt();

      const initialBal = await ethers.provider.getBalance(user1.address);

      await dao.connect(user1).withdraw(
        enc.handles[0],
        enc.inputProof,
        withdrawAmt
      );

      const finalBal = await ethers.provider.getBalance(user1.address);
      expect(await dao.treasuryBalance()).to.equal(TEN_ETH - ONE_ETH);
      expect(finalBal).to.be.gt(initialBal); // Balance increased (minus gas)
    });

    it("should deny withdrawal if member exceeds encrypted quota", async function () {
      // User1 already spent 1 ETH, limit is 5 ETH. 
      // Trying to withdraw 100 ETH should definitely fail.
      const withdrawAmt = ethers.parseEther("100.0");
      const withdrawAmtGwei = 100_000_000_000n;

      const input = fhevm.createEncryptedInput(daoAddr, user1.address);
      input.add64(withdrawAmtGwei);
      const enc = await input.encrypt();

      await expect(
        dao.connect(user1).withdraw(
          enc.handles[0],
          enc.inputProof,
          withdrawAmt
        )
      ).to.be.reverted;
    });
  });
});
