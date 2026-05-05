// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)
/**
 * Contract addresses - read from VITE_ env vars with hardcoded Sepolia fallbacks.
 *
 * Not secrets. All addresses are public on-chain data.
 * Update .env (when redeployed).
 */
export const ADDRESSES = {
  ConfidentialVault:
    import.meta.env.VITE_ADDR_VAULT     ?? '0xE72FccA450A9a0e4EBC1e61A38DC31c481Cff98c',
  ConfidentialPolicyEngine:
    import.meta.env.VITE_ADDR_CPE       ?? '0x7843ACB0d148e8D5d914ab6c040C50e4eE115d39',
  CPEGateway:
    import.meta.env.VITE_ADDR_GATEWAY   ?? '0x69cc375f1f0F65234fD1309442516BdBd6043429',
  PolicyRegistry:
    import.meta.env.VITE_ADDR_REGISTRY  ?? '0x6FFBDcFF78B4C9828d3B31b5EEbf13644DEf210d',
  AuditLogger:
    import.meta.env.VITE_ADDR_LOGGER    ?? '0xfA0DD0a1Ba7C6C0FaD50fb22961c9AB0db88b614',
  ConfidentialDAO:
    import.meta.env.VITE_ADDR_DAO       ?? '0x55112E95366721b709Afc8fA343747EEf6c3a2ca',
  DAOFactory:
    import.meta.env.VITE_ADDR_FACTORY   ?? '0x17493E2Cab0676F50b6aB0b3436de6e47F0E47C3',
} as const;

export const SEPOLIA_CHAIN_ID = 11155111;
export const SEPOLIA_EXPLORER = 'https://sepolia.etherscan.io';
