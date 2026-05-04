/**
 * Contract addresses - read from VITE_ env vars with hardcoded Sepolia fallbacks.
 *
 * Not secrets. All addresses are public on-chain data.
 * Update .env (when redeployed).
 */
export const ADDRESSES = {
  ConfidentialVault:
    import.meta.env.VITE_ADDR_VAULT     ?? '0xF3EdA17DAA3830c40E83165A4D4e950771E3b54C',
  ConfidentialPolicyEngine:
    import.meta.env.VITE_ADDR_CPE       ?? '0x37FaDa1148b13dFB5D5b5B1B5eCa5bD1a19C3f8F',
  CPEGateway:
    import.meta.env.VITE_ADDR_GATEWAY   ?? '0x7EA6400314caA86F27d83970aB77d23f3dEC6A24',
  PolicyRegistry:
    import.meta.env.VITE_ADDR_REGISTRY  ?? '0x78Ea3E74250041cDe8A5b4282Ab159474731D94A',
  AuditLogger:
    import.meta.env.VITE_ADDR_LOGGER    ?? '0x4Ce3cddA2E3322f62bF4301ea945e7A32AC1a95E',
} as const;

export const SEPOLIA_CHAIN_ID = 11155111;
export const SEPOLIA_EXPLORER = 'https://sepolia.etherscan.io';
