# ConfidentialVault | CPE Demo DApp

This is the interactive frontend demonstration for the **Confidential Policy Engine (CPE)** and its sample downstream contract, **ConfidentialVault**, built on Zama's FHEVM. 

You can view the live demo here: [https://cpengine.vercel.app/](https://cpengine.vercel.app/)

## Overview

The Vault DApp demonstrates how frontend applications can interact with smart contracts that utilize Fully Homomorphic Encryption (FHE) without exposing sensitive data on-chain or compromising the user experience.

### Key Interactions Displayed:
1. **Unrestricted Deposits:** Regular ETH deposits function normally, confirming that FHE does not impede standard transaction flows where confidentiality is unnecessary.
2. **Encrypted Withdrawals (⚡ FHE):** When a user initiates a withdrawal, the `amount` is **encrypted client-side** using `@zama-fhe/relayer-sdk` before the transaction is even sent to the network. The `ConfidentialVault` contract validates this encrypted amount against the user's bound policy limits-all in ciphertext.
3. **Compliant Transfers:** Vault balances can be transferred based on compliance tier gating, without exposing the user's actual KYC/Compliance tier on-chain.
4. **Policy Admin Controls:** Authorized admins can freeze or unfreeze policies. Crucially, this state update is an encrypted boolean operation, making it indistinguishable from any other state write on the blockchain.

## Getting Started Locally

### Prerequisites
- Node.js & npm (v18+ recommended)
- A WalletConnect Project ID (Free from [WalletConnect Cloud](https://cloud.walletconnect.com/))

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy the template environment file:
```bash
cp .env.example .env
```
Open `.env` and paste your WalletConnect Project ID:
```env
VITE_WALLETCONNECT_PROJECT_ID=your_project_id_here
```
> **Note:** The contract addresses for the Sepolia deployment are hardcoded as fallbacks in `src/contracts/addresses.ts`. You do not need to provide them in `.env` unless you wish to override them with your own local or testnet deployments.

### 3. Run the Development Server
```bash
npm run dev
```

The app will be available at `http://localhost:5173/`.

## Architecture & Integration Details

This project is built using:
- **Vite + React + TypeScript**
- **Wagmi & Viem** for Ethereum interactions
- **RainbowKit** for seamless wallet connection
- **@zama-fhe/relayer-sdk** for client-side FHE encryption and KMS interactions

### FHE Client-Side Encryption Workflow
To encrypt data client-side before sending it to the Vault, the application utilizes the Zama Relayer SDK. You can see this implemented in `src/hooks/useVault.ts`:

1. **Initialize SDK:** WASM is loaded asynchronously.
2. **Create Instance:** An `FhevmInstance` is created using the wallet's EIP-1193 provider.
3. **Encrypt Input:**
   ```typescript
   const input = fhevmInstance.createEncryptedInput(vaultAddress, userAddress);
   input.add64(amountGwei);
   const enc = await input.encrypt();
   ```
4. **Submit Transaction:** The resulting `handles` and `inputProof` are sent in the standard `ethers.js` contract call.
