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

**CPE is a programmable security layer that enforces encrypted policies entirely in ciphertext.**  
*Rules are private. Enforcement is on-chain. Security is absolute.*

</div>

## The Vision: Smart-Contract 2FA

On traditional blockchains, security is binary: if your private key is leaked, you lose 100% of your funds instantly. There is no "Daily Limit" or "Identity Verification" on a raw wallet.

**The Confidential Policy Engine (CPE)** adds an "Invisible Firewall" to any contract:
1. **Encrypted Limits**: Set secret daily/per-tx limits that no one-not even a hacker-can see.
2. **Confidential DAO-as-a-Service**: Spawn institutional-grade treasuries with private member quotas and whitelisting.
3. **On-Chain 2FA**: Even if an attacker steals your keys, they cannot drain your vault because the CPE blocks unauthorized outflows in ciphertext.
4. **Privacy-Preserving Compliance**: Gate access based on KYC/AML tiers without ever revealing the user's identity on-chain.

## Core Features

### 1. Confidential DAO Factory
Deploy independent, high-security treasuries in one click. Each DAO is gated by the CPE, allowing for:
*   **Whitelisted Membership**: Only authorized addresses can interact.
*   **Private Member Quotas**: Each member has a secret spending limit from the shared pool.
*   **Encrypted Governance**: Policy rules are evaluated without revealing the treasury's inner logic.

### 2. Programmable Anti-Theft (Vault)
A personal "Savings Safe" designed to be the ultimate defense against key theft. 
*   **Ghost Writes**: Policy updates are encrypted, making it impossible for observers to tell if you are tightening or loosening your security.
*   **Silent Denials**: Unauthorized transactions revert without revealing *why*, preventing attackers from "guessing" your limits.

### 3. Zero-Decryption Auditing
Built-in "Trust but Verify" model. 
*   **Auditor Roles**: Grant specific entities (regulators, auditors) the ability to decrypt encrypted logs off-chain.
*   **2-Step Admin Transfer**: Securely hand over policy control to institutional custodians.

## Technical Architecture

CPE is designed as a **Modular Security Platform**:

*   **ConfidentialPolicyEngine.sol**: The "Brain." Stores encrypted rules and performs homomorphic evaluation.
*   **CPEGateway.sol**: The "API." Provides a unified interface for downstream contracts (Vaults, DAOs, DEXs).
*   **ConfidentialDAOFactory.sol**: The "Scale." Allows for multi-tenant institutional deployments.
*   **AuditLogger.sol**: The "History." Maintains a confidential trail of evaluations for authorized auditors.

## Getting Started

### Prerequisites
| Tool                         | Version        |
| - | - |
| Node.js (LTS)                | v18.x or v20.x |
| npm                          | v8+            |
| Hardhat                      | latest         |

### Installation
```bash
git clone https://github.com/the3rdweblabs/CPE
npm install
npm run compile
```

## Project Structure

```
CPE/
├── .github/
│   └── workflows/
│       ├── main.yml                          # CI: lint + test on every push/PR
│       ├── manual-windows.yml                # Manual CI trigger for Windows runners
│       └── manual.yml                        # Manual CI trigger for Linux/macOS runners
├── .vscode/
│   ├── extensions.json                       # Recommended VS Code extensions (Solidity, ESLint, Prettier)
│   └── settings.json                         # Workspace formatting & editor settings
├── contracts/
│   ├── examples/                             # Illustration & Demo integrations
│   │   ├── ConfidentialVault.sol             # FHE-gated personal withdrawal vault + encrypted deposit tracking
│   │   ├── ConfidentialDAO.sol               # Shared treasury with private quotas + encrypted treasury tracking
│   │   └── ConfidentialDAOFactory.sol        # Institutional deployment engine
│   ├── interfaces/                           # Standardized integration interfaces
│   │   ├── IAuditLogger.sol                  # Modular logging interface
│   │   ├── ICPEGateway.sol                   # Gateway routing interface
│   │   ├── IConfidentialPolicyEngine.sol     # Core policy engine interface
│   │   └── IPolicyRegistry.sol               # Address registry interface
│   ├── libraries/                            # Shared error codes and helper functions
│   ├── AuditLogger.sol                       # Encrypted interaction logger (Auditor role)
│   ├── ConfidentialPolicyEngine.sol          # Main logic: rule evaluation, linkages & access control
│   ├── CPEGateway.sol                        # Integration surface for downstream apps
│   ├── PolicyRegistry.sol                    # On-chain storage for encrypted policy handles
│   └── mocks/
│       └── TestHelper.sol                    # Test-only fixture: materialises FHE handles via FHE.fromExternal()
│                                             # and forwards euint64 to the engine; emits Evaluated(ebool) so JS
│                                             # tests can inspect results without ACL-guarded storage reads.
│                                             # Inherits ZamaEthereumConfig (required for FHEVM infra addresses).
├── deploy/
│   ├── 01_deploy_cpe.ts                      # Hardhat-deploy script: deploys all contracts and wires permissions
│   ├── deployment.sepolia.txt                # Real terminal output from the first successful Sepolia deployment:
│   │                                         # contract addresses, wiring steps, Etherscan verification log.
│   │                                         # Proof-of-deployment reference - no secrets, safe to commit.
│   └── deployments.sepolia.json              # Machine-readable address manifest consumed by tasks & scripts
├── scripts/
│   └── debug-wiring.ts                       # One-shot debug script: verifies CPEGateway ↔ Vault authorisation
│                                             # on an already-deployed network (run with: npx hardhat run)
├── tasks/
│   ├── accounts.ts                           # Hardhat task: prints signer addresses and balances
│   ├── cpe-tasks.ts                          # Hardhat tasks for CPE: wallet, policy, vault, and institutional DAO ops
│   ├── cpe-tasks.txt                         # 17-step master guide for a full "A to Z" Sepolia workflow
│   └── cpe-tasks-completed.txt               # Real terminal session proving all tasks work on Sepolia live
├── test/
│   ├── CPE.test.ts                           # Core Engine test suite: limits, freeze, auditing, compliance
│   └── DAO.test.ts                           # Institutional DAO suite: factory, shared treasury, membership
├── vault-dapp/                               # React + Vite frontend demo for ConfidentialVault
│                                             # See vault-dapp/README.md for setup and usage
├── .env.example                              # Template for optional .env variables (RELAYER_URL etc.)
├── .gitignore
├── .prettierignore
├── .prettierrc.yml                           # Prettier formatting config (Solidity + TypeScript)
├── .solcover.js                              # Solidity coverage configuration
├── .solhint.json                             # Solidity linter rules
├── .solhintignore                            # Files excluded from Solidity linting
├── LICENSE                                   # GPL-3.0
├── README.md                                 # This file
├── eslint.config.mjs                         # ESLint config for TypeScript (scripts, tasks, tests)
├── gas-report.txt                            # Gas usage report generated by hardhat-gas-reporter
├── hardhat.config.ts                         # Hardhat configuration (networks, plugins, compiler settings)
├── package.json
├── package-lock.json
└── tsconfig.json                             # TypeScript compiler config (moduleResolution: bundler)
```

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
      ✔ should create a policy with encrypted inputs (348ms)
      ✔ should emit PolicyCreated event (141ms)
      ✔ should revert if policy already exists
    Address Binding
      ✔ should bind an address to a policy
      ✔ should confirm hasPolicy returns true for bound address
      ✔ should confirm hasPolicy returns false for unbound address
      ✔ should only allow policy admin to bind addresses
    Policy Evaluation via Vault
      ✔ should track encrypted balances on deposit (45ms)
      ✔ should approve a withdrawal within policy limits (60ms)
      ✔ should deny a withdrawal exceeding per-tx limit (201ms)
      ✔ should deny withdrawal from address with no policy (83ms)
      ✔ should deny withdrawal from frozen policy (193ms)
      ✔ should track rolling daily usage and enforce daily limit (843ms)
    Freeze / Unfreeze
      ✔ should emit PolicyFrozen on freeze
      ✔ should emit PolicyUnfrozen on unfreeze
      ✔ should only allow policy admin to freeze
    Policy Updates
      ✔ should update perTxLimit and emit event (74ms)
      ✔ should not allow non-admin to update policy
    Auditor Management
      ✔ should grant auditor access (51ms)
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
    Policy Registry and Audit Logger Integration
      ✔ should write bindings to PolicyRegistry on-chain automatically
      ✔ should allow only owner to configure registry and logger
    Compliance Evaluation
      ✔ should pass compliance check for sufficient tier
      ✔ should return false for insufficient compliance tier

  Confidential DAO & Factory
    DAO Factory
      ✔ should deploy a new DAO and set the correct owner
      ✔ should track all deployed DAOs for discovery
    DAO Treasury Operations
      ✔ should accept deposits into the shared treasury (42ms)
      ✔ should deny withdrawal for a non-member
      ✔ should allow a member to withdraw within their encrypted quota (122ms)
      ✔ should deny withdrawal if member exceeds encrypted quota


  37 passing (3s)
```

## Step 6 - Configure for Sepolia Deployment

Set your Hardhat config variables. These are stored securely by Hardhat (not in `.env`):

```bash
# Your wallet mnemonic (12-word seed phrase i.e. MetaMask, Trust Wallet, etc.)
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

- https://cloud.google.com/application/web3/faucet/ethereum/sepolia
- https://sepoliafaucet.com
- https://faucet.sepolia.dev

Confirm your balance before deploying:

```bash
npx hardhat console -network sepolia
> const [signer] = await ethers.getSigners()
> ethers.formatEther(await ethers.provider.getBalance(signer.address))
'0.5'  // need at least ~0.1 ETH for deployment
```

## Step 7 - Deploy to Sepolia

```bash
npm run deploy:sepolia
```

Real output from the project's Sepolia deployment:

```
Compiled 8 Solidity files successfully (evm target: cancun).

═══════════════════════════════════════════════════════
  Confidential Policy Engine - Full Stack Deployment
═══════════════════════════════════════════════════════
  Network:     sepolia
  Deployer:    0x9582f3b9daEE79697DdDca02a411f9632E4c95eA
═══════════════════════════════════════════════════════

1. Deploying Core Protocol...

2. Deploying Example Integrations...
    ✓ Vault:   0xE72FccA450A9a0e4EBC1e61A38DC31c481Cff98c
    ✓ Factory: 0x17493E2Cab0676F50b6aB0b3436de6e47F0E47C3
    ✓ Demo DAO: 0x55112E95366721b709Afc8fA343747EEf6c3a2ca

3. Wiring Infrastructure...

═══════════════════════════════════════════════════════
  Deployment Complete
═══════════════════════════════════════════════════════
  PolicyRegistry            : 0x6FFBDcFF78B4C9828d3B31b5EEbf13644DEf210d
  AuditLogger               : 0xfA0DD0a1Ba7C6C0FaD50fb22961c9AB0db88b614
  ConfidentialPolicyEngine  : 0x7843ACB0d148e8D5d914ab6c040C50e4eE115d39
  CPEGateway                : 0x69cc375f1f0F65234fD1309442516BdBd6043429
  ConfidentialVault         : 0xE72FccA450A9a0e4EBC1e61A38DC31c481Cff98c
  ConfidentialDAOFactory    : 0x17493E2Cab0676F50b6aB0b3436de6e47F0E47C3
  ConfidentialDAO           : 0x55112E95366721b709Afc8fA343747EEf6c3a2ca

  Saved: ./deploy/deployments.sepolia.json
═══════════════════════════════════════════════════════
```

Addresses are saved to `deploy/deployments.sepolia.json`. The full terminal log (including Etherscan verification output) is in [`deploy/deployment.sepolia.txt`](deploy/deployment.sepolia.txt).

## Step 8 - Hardhat Task CLI (Quickest Path)

All post-deployment interactions can be done without opening the Hardhat console. The built-in tasks cover the complete admin + user workflow. The ordered command sequence lives in [`tasks/cpe-tasks.txt`](tasks/cpe-tasks.txt):

```bash
# 1. Check your wallet balance and signer address
npx hardhat -network sepolia task:wallet

# 2. Create a policy (real FHE encryption, sent to Sepolia)
npx hardhat -network sepolia task:create-policy -name "my-first-policy"

# 3. Bind your wallet to the policy
npx hardhat -network sepolia task:bind-address -name "my-first-policy"

# 4. Confirm the policy is live
npx hardhat -network sepolia task:policy-info -name "my-first-policy"

# 5. Deposit ETH into the vault
npx hardhat -network sepolia task:deposit -amount "0.05"

# 6. Withdraw within limits (perTxLimit = 1 ETH) → APPROVED
npx hardhat -network sepolia task:withdraw -amount "0.01"

# 7. Withdraw over limit → DENIED (FHE.req() reverts silently)
npx hardhat -network sepolia task:withdraw -amount "2"

# 8. Test the silent freeze / unfreeze cycle
npx hardhat -network sepolia task:freeze   -name "my-first-policy"
npx hardhat -network sepolia task:withdraw -amount "0.01"   # denied
npx hardhat -network sepolia task:unfreeze -name "my-first-policy"
npx hardhat -network sepolia task:withdraw -amount "0.01"   # passes again
```

A real end-to-end terminal session with tx hashes and gas costs is in [`tasks/cpe-tasks-completed.txt`](tasks/cpe-tasks-completed.txt).

## Step 9 - Interact On-Chain via Console (Advanced)


After deployment, here's the full admin workflow using the Hardhat console.

> ⚠️ **Funds safety**: Deposits go to the Vault address referenced in your deployments JSON.  
> Always confirm which Vault you’re using before depositing.

```bash
npx hardhat console -network sepolia
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

// 1. Create a policy
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

// 2. Bind your trading wallet
const tradingWallet = "0xYOUR_TRADING_WALLET";
const tx2 = await cpe.bindAddress(policyId, tradingWallet);
await tx2.wait();
console.log("Address bound!");

// 3. Check policy metadata
const meta = await cpe.getPolicyMetadata(policyId);
console.log("Admin:", meta.policyAdmin);
console.log("Created:", new Date(Number(meta.createdAt) * 1000));

// 4. Test a withdrawal through the vault
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

// 5. Silent freeze
await cpe.freezePolicy(policyId);
// All subsequent transactions from bound addresses → silently denied
// On-chain, freeze is indistinguishable from any other state write

// 6. Grant auditor access
await cpe.grantAuditor(policyId, "0xAUDITOR_ADDRESS");
// Auditor can now request off-chain KMS decryption of policy handles
```

## Integrating CPE into Your Own Contract

Any contract can integrate by inheriting `ZamaEthereumConfig` and calling the `gateway`:

```solidity
// // SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)
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

## Gas Reference (Approximate, Sepolia)

| Operation             | Approx Gas |
| - | - |
| `createPolicy`        | ~400,000   |
| `evaluateTransaction` | ~300,000   |
| `freezePolicy`        | ~80,000    |
| `bindAddress`         | ~50,000    |
| `grantAuditor`        | ~150,000   |

FHE operations are more expensive than regular Solidity - the coprocessor handles the heavy computation off-chain but
the symbolic execution still costs gas on L1.

## Security Notes

- **ACL revocation limitation**: Once `FHE.allow(handle, auditor)` is called, it cannot be revoked for that specific
  handle. Revocation in our mapping prevents new handles (created after revocation) from being granted to revoked
  auditors, but historical handles remain accessible. Design policies with this in mind.
- **Plaintext timestamps**: `dailyResetAt` and `monthlyResetAt` are stored as plaintext - they reveal when windows reset
  but not the limits themselves. This is an acceptable trade-off for gas efficiency.
- **clearAmount parameter**: The `withdraw()` function in ConfidentialVault takes both an encrypted amount (for policy
  evaluation) and a `clearAmount` (for the actual ETH transfer). Ensure these match client-side - a mismatch doesn't
  bypass the policy since the encrypted amount is what's checked.

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
