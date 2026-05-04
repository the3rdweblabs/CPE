<div align="center">

# Confidential Policy Engine (CPE)

[![CI](https://github.com/the3rdweblabs/CPE/actions/workflows/main.yml/badge.svg)](https://github.com/the3rdweblabs/CPE/actions/workflows/main.yml)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Solidity](https://img.shields.io/badge/Solidity-%5E0.8.24-363636.svg?logo=solidity)](https://soliditylang.org/)
[![Built with Hardhat](https://img.shields.io/badge/Built%20with-Hardhat-FFEE99.svg?logo=hardhat)](https://hardhat.org/)
[![Powered by Zama FHEVM](https://img.shields.io/badge/Powered%20by-Zama%20FHEVM-orange.svg)](https://zama.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Code Style: Prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg)](https://github.com/prettier/prettier)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)

**Encrypted on-chain security policy engine built on Zama FHEVM.**  
*Policy rules are stored as FHE ciphertext - enforced on-chain, never visible.*

</div>

---

## What Is This?

CPE is a smart contract system that lets you define security policies for wallet addresses where **the rules themselves
are encrypted**. Any downstream contract integrates via a single function call to check whether a transaction is
permitted.

- Rules stored as `euint64`, `euint8`, `ebool` - encrypted on-chain
- Policy evaluation runs entirely in ciphertext (no decryption during checks)
- Address-bound enforcement - the same wallet on MetaMask, Trust Wallet, or CLI hits the same policy
- Silent freeze - policy freeze is indistinguishable from any other state write

---

## Prerequisites

| Tool                         | Version        |
| ---------------------------- | -------------- |
| Node.js (LTS, even-numbered) | v18.x or v20.x |
| npm                          | v8+            |
| Git                          | any            |

> ⚠️ **Important**: Hardhat does not support odd-numbered Node versions (v19, v21, v23).  
> Use `node -v` to check. Use `nvm use 20` to switch if needed.

---

## Step 1 - Clone from the FHEVM Template

The recommended way is to use Zama's official Hardhat template as your base - it comes pre-configured with the FHEVM
Hardhat plugin, mock FHE environment, and test utilities.

```bash
# Option A: Use the template on GitHub
# Go to: https://github.com/zama-ai/fhevm-hardhat-template
# Click "Use this template" → Create your repo → Clone it

# Option B: Clone directly (for reference/exploration)
git clone https://github.com/zama-ai/fhevm-hardhat-template CPE
cd CPE
```

Then **replace the `contracts/`**, **`test/`**, and **`deploy/`** folders with the CPE files from this repo.

---

## Step 2 - Install Dependencies

```bash
npm install
```

This installs:

- `@fhevm/solidity` - FHE Solidity library (FHE.\*, euint64, ebool, etc.)
- `fhevm` - Hardhat plugin with local FHE mock environment
- `fhevm-contracts` - Zama's standard contract library
- `hardhat`, `ethers`, `typechain` - standard dev toolchain

---

## Step 3 - Project Structure

```
CPE/
├── .github/
│   └── workflows/
│       ├── main.yml
│       ├── manual-windows.yml
│       └── manual.yml
├── .vscode/
│   ├── extensions.json
│   └── settings.json
├── contracts/
│   ├── AuditLogger.sol
│   ├── ConfidentialPolicyEngine.sol
│   ├── ConfidentialVault.sol
│   ├── CPEGateway.sol
│   ├── PolicyRegistry.sol
│   ├── interfaces/
│   │   ├── ICPEGateway.sol
│   │   └── IConfidentialPolicyEngine.sol
│   └── libraries/
│       ├── CPEErrors.sol
│       └── CPERoles.sol
├── deploy/
│   ├── 01_deploy_cpe.ts
│   └── deployments.sepolia.json
├── tasks/
│   └── cpe-tasks.ts
├── test/
│   └── CPE.test.ts
├── .env.example
├── .gitignore
├── .prettierignore
├── .prettierrc.yml
├── .solcover.js
├── .solhint.json
├── .solhintignore
├── .solhintignore
├── LICENSE
├── README.md
├── eslint.config.mjs
├── gas-report.txt
├── hardhat.config.ts
├── package-lock.json
├── package.json
└── tsconfig.json
```

---

## Step 4 - Compile

```bash
npm run compile
```

Expected output:

```
Compiled 6 Solidity files successfully
```

If you see `evmVersion` warnings, confirm `hardhat.config.ts` has `evmVersion: "cancun"` - required for transient
storage used by FHEVM ACL.

---

## Step 5 - Run Tests (Local Mock FHE)

```bash
npm test
```

The FHEVM Hardhat plugin runs a **local mock FHE environment**:

- All `FHE.*` operations are simulated locally - instant, deterministic
- `fhevm.createEncryptedInput()` encrypts test values
- `fhevm.decrypt*()` decrypts for assertions (test-only utility)
- No real cryptography - just logic verification

Expected output:

```
  ConfidentialPolicyEngine
    Policy Creation
      ✔ should create a policy with encrypted inputs (304ms)
      ✔ should emit PolicyCreated event (92ms)
      ✔ should revert if policy already exists
    Address Binding
      ✔ should bind an address to a policy
      ✔ should confirm hasPolicy returns true for bound address
      ✔ should confirm hasPolicy returns false for unbound address
      ✔ should only allow policy admin to bind addresses
    Policy Evaluation via Vault
      ✔ should approve a withdrawal within policy limits (113ms)
      ✔ should deny a withdrawal exceeding per-tx limit (45ms)
      ✔ should deny withdrawal from address with no policy (89ms)
      ✔ should deny withdrawal from frozen policy (53ms)
      ✔ should track rolling daily usage and enforce daily limit (236ms)
    Freeze / Unfreeze
      ✔ should emit PolicyFrozen on freeze
      ✔ should emit PolicyUnfrozen on unfreeze
      ✔ should only allow policy admin to freeze
    Policy Updates
      ✔ should update perTxLimit and emit event (46ms)
      ✔ should not allow non-admin to update policy (54ms)
    Auditor Management
      ✔ should grant auditor access
      ✔ should revoke auditor access in mapping
      ✔ should not allow non-admin to grant auditor
    Admin Transfer
      ✔ should initiate admin transfer
      ✔ should not allow wrong address to accept transfer
      ✔ should complete transfer when new admin accepts
    Caller Authorization
      ✔ should not allow unauthorized caller to call evaluateTransaction
      ✔ should authorize and revoke callers
      ✔ should not allow non-owner to authorize callers
    Compliance Evaluation
      ✔ should pass compliance check for sufficient tier
      ✔ should return false for insufficient compliance tier

  28 passing (1s)
```

---

## Step 6 - Configure for Sepolia Deployment

Set your Hardhat config variables. These are stored securely by Hardhat (not in `.env`):

```bash
# Your wallet mnemonic (12-word seed phrase from MetaMask)
npx hardhat vars set MNEMONIC

# Infura project ID (from https://infura.io)
npx hardhat vars set INFURA_API_KEY

# Etherscan API key for contract verification (from https://etherscan.io)
npx hardhat vars set ETHERSCAN_API_KEY
```

### Environment & required variables

This project uses a mix of Hardhat `vars` (stored via `npx hardhat vars set`) and an optional `.env` file for some CLI
tools. The key variables used by the build, deploy and FHE relayer workflows are:

- `MNEMONIC` - your wallet mnemonic (12-word seed phrase). Used to derive deployer accounts.
- `INFURA_API_KEY` - Infura project id for Sepolia RPC (or use any RPC provider URL via `RPC_URL`).
- `ETHERSCAN_API_KEY` - Etherscan API key for contract verification.
- `RELAYER_URL` - URL of the FHE relayer (e.g. `https://relayer.testnet.zama.org/v2`). Required for
  `fhevm.initializeCLIApi()` and on-chain input-proof requests.
- `ZAMA_FHEVM_API_KEY` - (optional) Zama API key required for some mainnet relayer operations.

> Note: withdraw flows require a working relayer connection (keys + input-proof).  
> If the relayer is unreachable you may still deploy and deposit, but encrypted withdrawals will fail during
> encryption/proof generation.

Prefer using Hardhat's secure store for the first three variables:

```bash
npx hardhat vars set MNEMONIC "<your mnemonic>"
npx hardhat vars set INFURA_API_KEY "<your-infura-id>"
npx hardhat vars set ETHERSCAN_API_KEY "<your-etherscan-key>"
npx hardhat vars set RELAYER_URL "https://relayer.testnet.zama.org/v2"
```

Some CLI utilities in the `@zama-fhe/relayer-sdk` also accept `.env` files named `.env.testnet`, `.env.devnet`, or
`.env` for convenience. Example variables for an `.env` file are provided in `.env.example`.

If you do not have access to a public relayer or your network blocks outbound traffic, you can run a local relayer for
development (see relayer SDK docs) or skip calling `fhevm.initializeCLIApi()` and use the local mock FHE environment for
testing.

Get Sepolia ETH from the faucet:

- https://sepoliafaucet.com
- https://faucet.sepolia.dev

Confirm your balance before deploying:

```bash
npx hardhat console --network sepolia
> const [signer] = await ethers.getSigners()
> ethers.formatEther(await ethers.provider.getBalance(signer.address))
'0.5'  // need at least ~0.1 ETH for deployment
```

---

## Step 7 - Deploy to Sepolia

```bash
npm run deploy:sepolia
```

Expected output (example):

```
═══════════════════════════════════════════════
  Confidential Policy Engine - Deployment
═══════════════════════════════════════════════
  Network:  sepolia
  Deployer: 0xYourAddress...
  Balance:  0.5 ETH
═══════════════════════════════════════════════

1. Deploying PolicyRegistry...
   ✓ PolicyRegistry deployed at: 0x...

2. Deploying AuditLogger...
   ✓ AuditLogger deployed at: 0x...

3. Deploying ConfidentialPolicyEngine...
   ✓ ConfidentialPolicyEngine deployed at: 0x...

4. Deploying CPEGateway...
   ✓ CPEGateway deployed at: 0x...

5. Deploying ConfidentialVault...
   ✓ ConfidentialVault deployed at: 0x...

6. Wiring permissions...
   ✓ CPE.authorizeCaller(gateway)
   ✓ Gateway.registerCaller(vault)

Saved: ./deploy/deployments.sepolia.json
═══════════════════════════════════════════════
```

Addresses are saved to `deploy/deployments.sepolia.json`.

---

## Step 8 - Interact On-Chain (Sepolia)

After deployment, here's the full admin workflow using the Hardhat console.

> ⚠️ **Funds safety**: Deposits go to the Vault address referenced in your deployments JSON.  
> Always confirm which Vault you’re using before depositing.

```bash
npx hardhat console --network sepolia
```

```typescript
// Load deployed addresses
const deployments = require("./deploy/deployments.sepolia.json");
const { fhevm } = require("hardhat");

// Get contract instances
const cpe = await ethers.getContractAt("ConfidentialPolicyEngine", deployments.contracts.ConfidentialPolicyEngine);
const vault = await ethers.getContractAt("ConfidentialVault", deployments.contracts.ConfidentialVault);

const [admin] = await ethers.getSigners();
const adminAddr = await admin.getAddress();

// === 1. Create a policy ===
const policyId = ethers.keccak256(ethers.toUtf8Bytes("my-trading-desk"));

const ONE_ETH_IN_GWEI = 1_000_000_000n; // 1 ETH = 1e9 gwei

const input = fhevm.createEncryptedInput(await cpe.getAddress(), adminAddr);
input.add64(ONE_ETH_IN_GWEI * 1n); // perTxLimit: 1 ETH (in gwei)
input.add64(ONE_ETH_IN_GWEI * 5n); // dailyLimit: 5 ETH (in gwei)
input.add64(ONE_ETH_IN_GWEI * 20n); // monthlyLimit: 20 ETH (in gwei)
input.add8(1); // riskTier: 1
input.add8(1); // complianceTier: 1
const enc = await input.encrypt();

const tx1 = await cpe.createPolicy(
  policyId,
  enc.handles[0],
  enc.handles[1],
  enc.handles[2],
  enc.handles[3],
  enc.handles[4],
  enc.inputProof,
);
await tx1.wait();
console.log("Policy created!");

// === 2. Bind your trading wallet ===
const tradingWallet = "0xYOUR_TRADING_WALLET";
const tx2 = await cpe.bindAddress(policyId, tradingWallet);
await tx2.wait();
console.log("Address bound!");

// === 3. Check policy metadata ===
const meta = await cpe.getPolicyMetadata(policyId);
console.log("Admin:", meta.policyAdmin);
console.log("Created:", new Date(Number(meta.createdAt) * 1000));

// === 4. Test a withdrawal through the vault ===
// (From the trading wallet - different signer)

// Encrypt amount in gwei (policy unit), send value in wei (actual transfer unit)
const clearAmountWei = ethers.parseEther("0.5");
const clearAmountGwei = clearAmountWei / 1_000_000_000n;

// IMPORTANT: Encrypt for CPE (verifier), not Vault.
const tradingInput = fhevm.createEncryptedInput(await cpe.getAddress(), tradingWallet);
tradingInput.add64(clearAmountGwei);
const tradingEnc = await tradingInput.encrypt();

// If within policy limits → succeeds
// If exceeds any limit or frozen → reverts silently
await vault.connect(tradingSigner).withdraw(tradingEnc.handles[0], tradingEnc.inputProof, clearAmountWei);

// === 5. Silent freeze ===
await cpe.freezePolicy(policyId);
// All subsequent transactions from bound addresses → silently denied
// On-chain, freeze is indistinguishable from any other state write

// === 6. Grant auditor access ===
await cpe.grantAuditor(policyId, "0xAUDITOR_ADDRESS");
// Auditor can now request off-chain KMS decryption of policy handles
```

---

## Integrating CPE into Your Own Contract

Any contract can integrate by inheriting `ZamaEthereumConfig` and calling the `gateway`:

```solidity
// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";
import "@fhevm/solidity/lib/FHE.sol";
import "./interfaces/ICPEGateway.sol";

contract YourProtocol is ZamaEthereumConfig {
  ICPEGateway public immutable gateway;

  constructor(address _gateway) {
    gateway = ICPEGateway(_gateway);
  }

  function sensitiveOperation(externalEuint64 encAmount, bytes calldata proof, uint256 clearAmount) external {
    // One line - evaluates all encrypted policy rules
    ebool approved = gateway.evaluateTransaction(msg.sender, encAmount, proof);

    // Reverts if any policy check failed (frozen, over limit, etc.)
    FHE.req(approved);

    // Your logic here - only reached if policy approved
    _doSomething(clearAmount);
  }

  function _doSomething(uint256 clearAmount) internal {
    // ...
    clearAmount;
  }
}
```

Then register your contract as a Gateway caller (Gateway owner only):

```typescript
await gateway.registerCaller(yourContractAddress, "YourProtocol v1");
```

---

## Key FHEVM Concepts to Remember

### 1. ACL Permissions Are Per-Handle

Every new FHE handle needs `FHE.allowThis()` - permissions don't transfer:

```solidity
// WRONG - new handle has no permissions
p.dailyUsed = FHE.sub(p.dailyUsed, amount);

// RIGHT - re-grant after every state-changing FHE operation
euint64 newValue = FHE.sub(p.dailyUsed, amount);
FHE.allowThis(newValue);           // contract can compute on it
FHE.allow(newValue, policyAdmin);  // admin can audit it
p.dailyUsed = newValue;
```

### 2. Use FHE.select() for Conditional Updates

Never use `if (condition)` on encrypted booleans - use encrypted ternary:

```solidity
// WRONG - can't branch on encrypted bool
if (approved) { p.dailyUsed = FHE.add(p.dailyUsed, amount); }

// RIGHT - encrypted conditional, no branch
p.dailyUsed = FHE.select(approved, FHE.add(p.dailyUsed, amount), p.dailyUsed);
```

### 3. externalEuintXX vs euintXX

- `externalEuint64` - input from user (comes with ZKPoK proof, needs `FHE.fromExternal()`)
- `euint64` - internal handle (already in contract state, no proof needed)

### 4. Transient vs Persistent ACL

- `FHE.allowThis()` - permanent (survives across transactions)
- `FHE.allow(handle, address)` - permanent for specific address
- `FHE.allowTransient(handle, address)` - this transaction only (used for return values)

---

## Gas Reference (Approximate, Sepolia)

| Operation             | Approx Gas |
| --------------------- | ---------- |
| `createPolicy`        | ~400,000   |
| `evaluateTransaction` | ~300,000   |
| `freezePolicy`        | ~80,000    |
| `bindAddress`         | ~50,000    |
| `grantAuditor`        | ~150,000   |

FHE operations are more expensive than regular Solidity - the coprocessor handles the heavy computation off-chain but
the symbolic execution still costs gas on L1.

---

## Security Notes

- **ACL revocation limitation**: Once `FHE.allow(handle, auditor)` is called, it cannot be revoked for that specific
  handle. Revocation in our mapping prevents new handles (created after revocation) from being granted to revoked
  auditors, but historical handles remain accessible. Design policies with this in mind.
- **Plaintext timestamps**: `dailyResetAt` and `monthlyResetAt` are stored as plaintext - they reveal when windows reset
  but not the limits themselves. This is an acceptable trade-off for gas efficiency.
- **clearAmount parameter**: The `withdraw()` function in ConfidentialVault takes both an encrypted amount (for policy
  evaluation) and a `clearAmount` (for the actual ETH transfer). Ensure these match client-side - a mismatch doesn't
  bypass the policy since the encrypted amount is what's checked.

---

## About Zama & FHE Resources

This project leverages Fully Homomorphic Encryption (FHE) technology built by [Zama](https://zama.org/). Zama is an open-source cryptography company building state-of-the-art FHE solutions for blockchain and AI, enabling computations on encrypted data without ever decrypting it.

### Zama Portfolio & Core Technologies
- **[fhEVM](https://github.com/zama-ai/fhevm):** Confidential smart contracts on EVM-compatible blockchains using standard Solidity.
- **[TFHE-rs](https://github.com/zama-ai/tfhe-rs):** A pure Rust implementation of the TFHE scheme for Boolean and integer arithmetics over encrypted data.
- **[Concrete](https://github.com/zama-ai/concrete):** A TFHE compiler that converts Python programs into FHE equivalents.
- **[Concrete ML](https://github.com/zama-ai/concrete-ml):** A privacy-preserving machine learning framework built on top of Concrete.
- **[Awesome-Zama](https://github.com/zama-ai/awesome-zama):** A curated master list of FHE resources, research papers, tutorials, and libraries.

### Resources & Socials
Stay connected with Zama and the FHE developer community:
- **Website:** [zama.org](https://zama.org/)
- **Documentation:** [docs.zama.ai](https://docs.zama.ai/)
- **Developer Hub:** [zama.org/developer-hub](https://zama.org/developer-hub)
- **GitHub:** [@zama-ai](https://github.com/zama-ai)
- **X (Twitter):** [@zama_fhe](https://x.com/zama_fhe)
- **Telegram:** [zama_on_telegram](https://t.me/zama_on_telegram)
- **Community Channels:** [zama.org/community-channels](https://zama.org/community-channels)
