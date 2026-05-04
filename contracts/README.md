# Confidential Policy Engine (CPE) - Smart Contract Architecture

The **Confidential Policy Engine (CPE)** is an on-chain security policy engine built using **Zama's Fully Homomorphic Encryption (FHEVM)**. It allows security rules to be defined for wallet addresses where the rules themselves and the evaluation process remain completely encrypted on-chain.

## High-Level Architecture

The system is designed to separate the policy management (CPE) from the integration layer (Gateway) and the consumer (Downstream Contracts).

### 1. ConfidentialPolicyEngine.sol (The Core Engine)
- **State Storage:** Stores policy rules in encrypted state (`euint64`, `euint8`, `ebool`).
- **Encrypted Rules:** Supports financial controls (`perTxLimit`, `dailyLimit`, `monthlyLimit`) and access controls (`riskTier`, `complianceTier`, `frozen`).
- **Zero-Decryption Evaluation:** Runs policy evaluations entirely in ciphertext. It doesn't decrypt values to check conditions; instead, it uses FHE operations (like `FHE.le`, `FHE.add`, `FHE.and`) to evaluate the encrypted input against the encrypted policy limits.
- **Address Binding:** Maps user addresses to a specific `policyId`, making rules address-bound regardless of the client (MetaMask, CLI, etc.).
- **Auditing & Access Control:** Employs a robust access control mechanism with a 2-step admin transfer and specific Auditor grants that permit off-chain KMS decryption of handles for auditing.

### 2. CPEGateway.sol (The Router)
- **Integration Surface:** Acts as the main integration surface for any protocol wanting to use the CPE.
- **Caller Registry:** Maintains a whitelist of downstream contracts.
- **Rate Limiting:** Implements anti-spam / rate-limiting (e.g., max calls per block per contract) to prevent abuse.
- **Seamless Upgradability:** Routes `evaluateTransaction` and `evaluateCompliance` calls to the underlying Engine, making the system upgradeable without needing to refactor downstream consumer contracts.

### 3. ConfidentialVault.sol (Example Consumer)
- **Integration Example:** An example contract showing how a DeFi protocol or wallet could integrate CPE.
- **Encrypted Execution:** It takes an encrypted withdrawal amount (`encAmount`) and a ZK proof (`inputProof`) alongside a plaintext `clearAmount`.
- **Enforcement Gate:** Before executing the withdrawal, it asks the Gateway if the transaction is allowed. If the returned encrypted boolean resolves to false, `FHE.req(approved)` silently reverts the transaction, masking whether the failure was due to a limit breach, a freeze, or another rule.

## Key FHE Concepts in Use

CPE heavily relies on the specifics of FHEVM to maintain privacy and security:

- **No Decryption During Evaluation:** The engine never uses branching (`if (condition)`) on sensitive data. It relies on `FHE.select(approved, projectedDaily, p.dailyUsed)` to conditionally update state without leaking information.
- **Strict Access Control Lists (ACL):** 
  - `FHE.allowThis()` is called constantly to grant the smart contract itself permission to operate on newly created ciphertext handles.
  - `FHE.allowTransient()` is used to pass the evaluation result (`ebool approved`) from the engine, through the gateway, and back to the downstream consumer contract within the same transaction.
  - `FHE.allow(handle, address)` is utilized to give Auditors explicit read access for off-chain decryption via the KMS.
- **Silently Updating Values:** For example, when an admin freezes a policy or updates a limit, the value passed is encrypted. The transaction data on-chain does not reveal the new state or the action taken, preserving operational privacy.

## Evaluation Workflow

1. **Setup:** The Admin creates a policy with encrypted limits and binds a user's wallet address to it.
2. **Action:** The user attempts an action on a downstream protocol (like withdrawing from `ConfidentialVault`). They encrypt their transaction amount locally and attach a zero-knowledge proof.
3. **Routing:** The Vault forwards the encrypted amount to the `CPEGateway`, which passes it to the `ConfidentialPolicyEngine`.
4. **Resolution:** The engine executes the FHE math, checking limits and counters. It returns an encrypted boolean indicating whether the operation is approved.
5. **Enforcement:** The Vault calls `FHE.req(approved)` on the returned boolean. If the FHE co-processor determines the boolean is false, the transaction halts silently.

> **Note:** Because of the `CPEGateway`, this architecture is highly modular. You can connect numerous custom protocols (DeFi, RWAs, DAO Treasuries) to a single centralized, encrypted policy engine for a user.
