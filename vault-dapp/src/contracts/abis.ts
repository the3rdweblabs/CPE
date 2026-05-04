// Minimal ABIs - only the functions/events the dApp actually calls.

export const VAULT_ABI = [
  // State-changing
  {
    name: 'deposit',
    type: 'function',
    stateMutability: 'payable',
    inputs: [],
    outputs: [],
  },
  {
    // encAmount  → externalEuint64 (bytes32 in ABI)
    // inputProof → ZKPoK bytes
    // clearAmount→ plaintext Wei (for the actual ETH transfer)
    name: 'withdraw',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'encAmount',   type: 'bytes32' },
      { name: 'inputProof',  type: 'bytes'   },
      { name: 'clearAmount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    // Compliance-gated internal-balance transfer (no FHE input from client)
    name: 'compliantTransfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to',           type: 'address' },
      { name: 'amount',       type: 'uint256' },
      { name: 'requiredTier', type: 'uint8'   },
    ],
    outputs: [],
  },

  // Views
  {
    name: 'balances',
    type: 'function',
    stateMutability: 'view',
    inputs:  [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'policyEngine',
    type: 'function',
    stateMutability: 'view',
    inputs:  [],
    outputs: [{ name: '', type: 'address' }],
  },

  // Events
  {
    name: 'Deposited',
    type: 'event',
    anonymous: false,
    inputs: [
      { indexed: true,  name: 'user',   type: 'address' },
      { indexed: false, name: 'amount', type: 'uint256' },
    ],
  },
  {
    name: 'WithdrawalApproved',
    type: 'event',
    anonymous: false,
    inputs: [{ indexed: true, name: 'user', type: 'address' }],
  },
  {
    name: 'WithdrawalDenied',
    type: 'event',
    anonymous: false,
    inputs: [{ indexed: true, name: 'user', type: 'address' }],
  },
] as const;

export const CPE_ABI = [
  // Views
  {
    name: 'hasPolicy',
    type: 'function',
    stateMutability: 'view',
    inputs:  [{ name: 'subject', type: 'address' }],
    outputs: [{ name: '',        type: 'bool'    }],
  },
  {
    name: 'getPolicyForAddress',
    type: 'function',
    stateMutability: 'view',
    inputs:  [{ name: 'subject', type: 'address' }],
    outputs: [{ name: '',        type: 'bytes32' }],
  },
  {
    name: 'getPolicyMetadata',
    type: 'function',
    stateMutability: 'view',
    inputs:  [{ name: 'policyId', type: 'bytes32' }],
    outputs: [
      { name: 'policyAdmin',    type: 'address' },
      { name: 'pendingAdmin',   type: 'address' },
      { name: 'exists',         type: 'bool'    },
      { name: 'createdAt',      type: 'uint256' },
      { name: 'updatedAt',      type: 'uint256' },
      { name: 'dailyResetAt',   type: 'uint256' },
      { name: 'monthlyResetAt', type: 'uint256' },
    ],
  },
  {
    name: 'isAuditor',
    type: 'function',
    stateMutability: 'view',
    inputs:  [{ name: 'policyId', type: 'bytes32' }, { name: 'auditor', type: 'address' }],
    outputs: [{ name: '',         type: 'bool'    }],
  },

  // State-changing
  {
    name: 'freezePolicy',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs:  [{ name: 'policyId', type: 'bytes32' }],
    outputs: [],
  },
  {
    name: 'unfreezePolicy',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs:  [{ name: 'policyId', type: 'bytes32' }],
    outputs: [],
  },
  {
    name: 'bindAddress',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'policyId', type: 'bytes32' },
      { name: 'subject',  type: 'address' },
    ],
    outputs: [],
  },
  {
    name: 'unbindAddress',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs:  [{ name: 'subject', type: 'address' }],
    outputs: [],
  },

  // Events
  {
    name: 'PolicyFrozen',
    type: 'event',
    anonymous: false,
    inputs: [
      { indexed: true,  name: 'policyId', type: 'bytes32' },
      { indexed: false, name: 'ts',       type: 'uint256' },
    ],
  },
  {
    name: 'PolicyUnfrozen',
    type: 'event',
    anonymous: false,
    inputs: [
      { indexed: true,  name: 'policyId', type: 'bytes32' },
      { indexed: false, name: 'ts',       type: 'uint256' },
    ],
  },
] as const;
