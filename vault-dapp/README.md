# ConfidentialVault | CPE Demo DApp

This is the interactive frontend demonstration for the **Confidential Policy Engine (CPE)** and its sample downstream contract, **ConfidentialVault**, built on Zama's FHEVM. 

You can view the live demo here: [https://cpengine.vercel.app/](https://cpengine.vercel.app/)

## Overview

The Vault DApp demonstrates how frontend applications can interact with smart contracts that utilize Fully Homomorphic Encryption (FHE) without exposing sensitive data on-chain or compromising the user experience.

### Key Interactions Displayed:
1. **Unrestricted Deposits:** Regular ETH deposits function normally, confirming that FHE does not impede standard transaction flows where confidentiality is unnecessary.
2. **Encrypted Withdrawals (⚡ FHE):** When a user initiates a withdrawal, the `amount` is **encrypted client-side** using `@zama-fhe/relayer-sdk` before the transaction is even sent to the network. The `ConfidentialVault` contract validates this encrypted amount against the user's bound policy limits-all in ciphertext.
3. **Shared DAO Treasury Pools:** Users can deposit into and withdraw privately from a shared corporate pool. A member's personal FHE policy on-chain determines their private spending limits.
4. **Institutional Auto-Discovery:** Automated registry scanning detects and compiles all DAOs, policies, and roles (member/admin) bound to the user's address.
5. **On-Demand Institution Deployment:** Members can deploy newly created confidential institutions/DAOs directly from the dashboard.
6. **Protocol Health Diagnostics:** Real-time on-chain verification verifying registry authorization, caller logging permissions, and active gateway trust statuses.

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
Open `.env` and configure your WalletConnect Project ID and active network:
```env
VITE_WALLETCONNECT_PROJECT_ID=your_project_id_here
VITE_NETWORK=sepolia  # Toggle between 'sepolia' or 'mainnet'
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
