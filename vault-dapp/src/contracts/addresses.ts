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
    import.meta.env.VITE_ADDR_VAULT     ?? '0xE2F5a96D3C2901085B4106fff07c7A39D88C06D1',
  ConfidentialPolicyEngine:
    import.meta.env.VITE_ADDR_CPE       ?? '0x83Cf96bcfDaD84ee0c0B222Ee9BcE89DfE41C59c',
  CPEGateway:
    import.meta.env.VITE_ADDR_GATEWAY   ?? '0x78FBB8A0134f189DD016C7F778f44b1ecbe7AAb6',
  PolicyRegistry:
    import.meta.env.VITE_ADDR_REGISTRY  ?? '0xB0B2a558975be15B145E3451d8A16227CcFf914B',
  AuditLogger:
    import.meta.env.VITE_ADDR_LOGGER    ?? '0x4574d5F4a25AD9231f2a8Cb9454737DAd3461Db3',
  ConfidentialDAO:
    import.meta.env.VITE_ADDR_DAO       ?? '0xfeE66FEAe898CBb241d55dAb6526c1b43c068237',
  DAOFactory:
    import.meta.env.VITE_ADDR_FACTORY   ?? '0xAa3Fe2eFaFC2EFBB8019B9255Cf8A5136563635D',
} as const;

export const SEPOLIA_CHAIN_ID = 11155111;
export const SEPOLIA_EXPLORER = 'https://sepolia.etherscan.io';
export const SEPOLIA_START_BLOCK = 10700000;
