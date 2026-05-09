// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)
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
    name: 'encryptedBalance',
    type: 'function',
    stateMutability: 'view',
    inputs:  [{ name: 'user', type: 'address' }],
    outputs: [{ name: '',     type: 'bytes32' }],
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

export const DAO_ABI = [
  // State-changing
  {
    name: 'addMember',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: '_member', type: 'address' }],
    outputs: [],
  },
  {
    name: 'removeMember',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: '_member', type: 'address' }],
    outputs: [],
  },
  {
    name: 'deposit',
    type: 'function',
    stateMutability: 'payable',
    inputs: [],
    outputs: [],
  },
  {
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
    name: 'isMember',
    type: 'function',
    stateMutability: 'view',
    inputs:  [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'owner',
    type: 'function',
    stateMutability: 'view',
    inputs:  [],
    outputs: [{ name: '', type: 'address' }],
  },
  // Views
  {
    name: 'treasuryBalance',
    type: 'function',
    stateMutability: 'view',
    inputs:  [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'encryptedTreasuryBalance',
    type: 'function',
    stateMutability: 'view',
    inputs:  [],
    outputs: [{ name: '', type: 'bytes32' }],
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
    inputs: [
      { indexed: true,  name: 'user',   type: 'address' },
      { indexed: false, name: 'amount', type: 'uint256' },
    ],
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
    name: 'createPolicy',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'policyId',           type: 'bytes32' },
      { name: 'encPerTxLimit',      type: 'bytes32' },
      { name: 'encDailyLimit',      type: 'bytes32' },
      { name: 'encMonthlyLimit',    type: 'bytes32' },
      { name: 'encRiskTier',        type: 'bytes32' },
      { name: 'encComplianceTier',  type: 'bytes32' },
      { name: 'inputProof',         type: 'bytes'   },
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
    name: 'PolicyCreated',
    type: 'event',
    anonymous: false,
    inputs: [
      { indexed: true,  name: 'policyId', type: 'bytes32' },
      { indexed: true,  name: 'admin',    type: 'address' },
      { indexed: false, name: 'ts',       type: 'uint256' },
    ],
  },
  {
    name: 'AddressBound',
    type: 'event',
    anonymous: false,
    inputs: [
      { indexed: true,  name: 'policyId', type: 'bytes32' },
      { indexed: true,  name: 'subject',  type: 'address' },
      { indexed: false, name: 'ts',       type: 'uint256' },
    ],
  },
  {
    name: 'AddressUnbound',
    type: 'event',
    anonymous: false,
    inputs: [
      { indexed: true,  name: 'policyId', type: 'bytes32' },
      { indexed: true,  name: 'subject',  type: 'address' },
      { indexed: false, name: 'ts',       type: 'uint256' },
    ],
  },
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

export const DAO_FACTORY_ABI = [
  {
    name: 'createDAO',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'gateway', type: 'address' },
      { name: 'name',    type: 'string'  },
    ],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'allDAOs',
    type: 'function',
    stateMutability: 'view',
    inputs:  [{ name: '', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'getDAOCount',
    type: 'function',
    stateMutability: 'view',
    inputs:  [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'getAllDAOs',
    type: 'function',
    stateMutability: 'view',
    inputs:  [],
    outputs: [{ name: '', type: 'address[]' }],
  },
] as const;

export const REGISTRY_ABI = [
  {
    name: 'isAuthorizedWriter',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'writer', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

export const LOGGER_ABI = [
  {
    name: 'isAuthorizedLogger',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'logger', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;
