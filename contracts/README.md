# Confidential Policy Engine (CPE) - Smart Contract Architecture

The **Confidential Policy Engine (CPE)** is an on-chain security protocol built using **Zama's Fully Homomorphic Encryption (FHEVM)**. It allows security rules to be defined for wallet addresses where the rules themselves, the user's spending history, and the evaluation process remain completely encrypted on-chain.

## Directory Structure

The codebase is organized into **Core Protocol** and **Example Integrations**:

```bash
contracts/
├── ConfidentialPolicyEngine.sol  # Main logic: rule evaluation, linkages & access control
├── CPEGateway.sol                # Integration surface for downstream apps
├── PolicyRegistry.sol            # Standalone pure Solidity address-to-policy registry
├── AuditLogger.sol               # Standalone pure Solidity encrypted interaction logger
├── interfaces/                   # Modular integration interfaces (IAuditLogger, IPolicyRegistry, etc.)
├── libraries/                    # Shared error codes and helper functions
└── examples/                     # Illustration & Demo integrations
    ├── ConfidentialVault.sol     # FHE-gated personal withdrawal vault + encrypted deposit tracking
    ├── ConfidentialDAO.sol       # Shared treasury with private quotas + encrypted treasury tracking
    └── ConfidentialDAOFactory.sol # Institutional deployment engine
```

---

## Core Protocol Components

### 1. ConfidentialPolicyEngine.sol (The Core)
- **State Storage:** Stores policy rules in encrypted state (`euint64`, `euint8`, `ebool`).
- **Encrypted Rules:** Supports financial controls (`perTxLimit`, `dailyLimit`, `monthlyLimit`) and access controls (`riskTier`, `complianceTier`, `frozen`).
- **On-Chain Linkages:** Automatically links and updates bindings inside the standalone `PolicyRegistry` and emits records to `AuditLogger` dynamically using secure `setPolicyRegistry` and `setAuditLogger` setters.
- **Zero-Decryption Evaluation:** Runs evaluations entirely in ciphertext. It uses FHE operations (like `FHE.le`, `FHE.add`, `FHE.and`) to evaluate inputs without leaking plaintext data.
- **Address Binding:** Maps user addresses to a specific `policyId`, making rules address-bound regardless of the client (MetaMask, CLI, etc.).

### 2. CPEGateway.sol (The Router)
- **Integration Surface:** The main entry point for any protocol wanting to use the CPE.
- **Caller Registry:** Maintains a whitelist of downstream contracts.
- **Rate Limiting:** Implements anti-spam mechanisms to prevent co-processor overload.
- **Upgradability:** Routes calls to the underlying Engine, allowing logic updates without refactoring consumer contracts.

### 3. PolicyRegistry.sol & AuditLogger.sol
- **Registry:** Provides a centralized mapping of policy IDs to their plaintext metadata (createdAt, updatedAt, policyAdmin) to aid off-chain indexing and UI display. Now implements `IPolicyRegistry` for automatic on-chain binder synchronization.
- **AuditLogger:** Employs an encrypted logging mechanism implementing `IAuditLogger`. It allows designated **Auditors** to request KMS decryption of interaction handles for compliance reviews, while keeping them hidden from the general public.

---

## Example Integrations (The "Illustrations")

### 1. ConfidentialVault (Personal Security)
An example of an individual "Swiss Bank Account." It demonstrates how a user can secure their own funds with an encrypted daily limit. 
- **Encrypted Balance Tracking:** Converts plain ETH deposit values into ciphertext `euint64` handles via `FHE.asEuint64()` inside `deposit()` to protect personal wealth information.
- **Policy-Gated Withdrawals:** Attacker is strictly limited by the encrypted policy stored in the CPE.

### 2. ConfidentialDAO (Institutional Treasury)
A shared treasury model. Instead of individual balances, it uses a common pool of ETH. Members are granted **encrypted spending quotas** by the DAO Admin. 
- **Encrypted Treasury Tracking:** Tracks shared treasury balances fully in ciphertext using `FHE.asEuint64` to prevent external parties from seeing treasury reserves.
- **Privacy:** Members can withdraw from the treasury without the public (or other members) knowing their total spending limit.
- **Control:** The DAO Admin can instantly freeze a member's spending power by updating their policy in the CPE.

### 3. DAOFactory
A deployment engine that allows users to spin up their own `ConfidentialDAO` instances. It establishes a "Confidential DAO-as-a-Service" model, where the CPE acts as the shared security layer for an entire ecosystem of institutions.

---

## Key FHE Concepts in Use

- **No Decryption During Evaluation:** The engine never uses branching (`if (condition)`) on sensitive data. It relies on `FHE.select` to conditionally update state without leaking information.
- **Strict Access Control Lists (ACL):** 
  - `FHE.allowThis()` grants the contract itself permission to operate on ciphertext.
  - `FHE.allowTransient()` passes the evaluation result (`ebool approved`) back to the consumer.
  - `FHE.allow(handle, address)` gives Auditors explicit read access for KMS decryption.
- **Operation Masking:** When an admin freezes a policy, the transaction looks identical to a limit update, preserving operational privacy.

---

## Evaluation Workflow

1. **Setup:** Admin creates a policy with encrypted limits and binds a user's wallet address.
2. **Action:** User attempts a withdrawal from `ConfidentialVault` or `ConfidentialDAO`. They encrypt the amount locally and attach a ZK proof.
3. **Routing:** The consumer forwards the encrypted amount to the `CPEGateway`, which passes it to the `ConfidentialPolicyEngine`.
4. **Resolution:** The engine executes the FHE math and returns an `ebool approved`.
5. **Enforcement:** The consumer calls `FHE.req(approved)`. If false, the transaction reverts silently.
