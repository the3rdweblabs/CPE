// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)
/**
 * useVault - all contract interactions for the demo dApp.
 *
 * FHE flow (withdraw only):
 *   1. Convert ETH → Gwei  (policy unit)
 *   2. fhevmInstance.createEncryptedInput(vaultAddr, userAddr).add64(amountGwei)
 *   3. vault.withdraw(handles[0], inputProof, amountWei)
 *
 * All other operations are standard ethers calls.
 */
import { useState, useCallback, useRef } from 'react';
import { BrowserProvider, JsonRpcProvider, Contract, parseEther, formatEther, solidityPackedKeccak256 } from 'ethers';
import { ADDRESSES, SEPOLIA_EXPLORER, SEPOLIA_START_BLOCK } from '../contracts/addresses';
import { VAULT_ABI, CPE_ABI, DAO_ABI, DAO_FACTORY_ABI } from '../contracts/abis';
import type { FhevmInstance } from './useFhevm';

export type TxStatus = 'idle' | 'encrypting' | 'pending' | 'success' | 'denied' | 'error';

export interface TxRecord {
  type: string;
  hash: string;
  etherscanUrl: string;
  status: 'approved' | 'denied' | 'confirmed';
  timestamp: number;
}

// Fast, reliable read provider that persists regardless of user wallet state
export function getReadProvider() {
  const infura = import.meta.env.VITE_INFURA_API_KEY;
  const url = infura 
    ? `https://sepolia.infura.io/v3/${infura}` 
    : 'https://ethereum-sepolia-rpc.publicnode.com';
  return new JsonRpcProvider(url);
}

export function getProvider() {
  if (!window.ethereum) throw new Error('No wallet detected');
  return new BrowserProvider(window.ethereum as ConstructorParameters<typeof BrowserProvider>[0]);
}

async function getVault(withSigner = true) {
  if (withSigner) {
    const p = getProvider();
    const signer = await p.getSigner();
    return new Contract(ADDRESSES.ConfidentialVault, VAULT_ABI, signer);
  }
  return new Contract(ADDRESSES.ConfidentialVault, VAULT_ABI, getReadProvider());
}

async function getCPE(withSigner = true) {
  if (withSigner) {
    const p = getProvider();
    const signer = await p.getSigner();
    return new Contract(ADDRESSES.ConfidentialPolicyEngine, CPE_ABI, signer);
  }
  return new Contract(ADDRESSES.ConfidentialPolicyEngine, CPE_ABI, getReadProvider());
}

export function useVault() {
  const [balance, setBalance] = useState<string | null>(null);
  const [daoBalance, setDaoBalance] = useState<string | null>(null);
  const [selectedDAO, setSelectedDAO] = useState<string>(ADDRESSES.ConfidentialDAO);
  const [hasPolicy, setHasPolicy] = useState<boolean | null>(null);
  const [policyId, setPolicyId] = useState<string | null>(null);
  const [policyMeta, setPolicyMeta] = useState<Record<string, unknown> | null>(null);
  const [txStatus, setTxStatus] = useState<TxStatus>('idle');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [txHistory, setTxHistory] = useState<TxRecord[]>([]);
  const currentAddressRef = useRef<string | null>(null);
  // Reads

  const refreshBalance = useCallback(async (address: string) => {
    try {
      const vault = await getVault(false);
      const raw = await vault.balances(address);
      setBalance(formatEther(raw));
    } catch (e) {
      console.error('refreshBalance:', e);
    }
  }, []);

  const refreshTreasury = useCallback(async () => {
    try {
      const p = getReadProvider();
      const dao = new Contract(selectedDAO, DAO_ABI, p);
      const raw = await dao.treasuryBalance();
      setDaoBalance(formatEther(raw));
    } catch (e) {
      console.error('refreshTreasury:', e);
    }
  }, [selectedDAO]);

  const refreshPolicy = useCallback(async (address: string) => {
    try {
      const cpe = await getCPE(false);
      const has = await cpe.hasPolicy(address);
      setHasPolicy(has);

      if (has) {
        const id = await cpe.getPolicyForAddress(address);
        setPolicyId(id);
        const meta = await cpe.getPolicyMetadata(id);
        // determine frozen state by inspecting latest freeze/unfreeze events
        let frozenFlag: boolean | null = null;
        try {
          const frozenEvents = await cpe.queryFilter(cpe.filters.PolicyFrozen(id), SEPOLIA_START_BLOCK);
          const unfrozenEvents = await cpe.queryFilter(cpe.filters.PolicyUnfrozen(id), SEPOLIA_START_BLOCK);
          const lastFrozen = frozenEvents.length ? frozenEvents[frozenEvents.length - 1] : null;
          const lastUnfrozen = unfrozenEvents.length ? unfrozenEvents[unfrozenEvents.length - 1] : null;
          if (lastFrozen && lastUnfrozen) {
            frozenFlag = lastFrozen.blockNumber > lastUnfrozen.blockNumber;
          } else if (lastFrozen) {
            frozenFlag = true;
          } else if (lastUnfrozen) {
            frozenFlag = false;
          }
        } catch (e) {
          console.warn('could not derive frozen state from events', e);
        }

        const savedName = window.localStorage.getItem(`policyName:${id.toLowerCase()}`);
        setPolicyMeta({
          name: savedName || `Policy ${id.slice(0, 10)}...`,
          policyAdmin: meta[0],
          pendingAdmin: meta[1],
          exists: meta[2],
          createdAt: new Date(Number(meta[3]) * 1000).toISOString(),
          updatedAt: new Date(Number(meta[4]) * 1000).toISOString(),
          dailyResetAt: new Date(Number(meta[5]) * 1000).toISOString(),
          monthlyResetAt: new Date(Number(meta[6]) * 1000).toISOString(),
          frozen: frozenFlag,
        });
      } else {
        setPolicyId(null);
        setPolicyMeta(null);
      }
    } catch (e) {
      console.error('refreshPolicy:', e);
    }
  }, []);

  // Helpers

  function resetTx() {
    setTxStatus('idle');
    setTxHash(null);
    setTxError(null);
  }

  const pushHistory = useCallback((record: TxRecord) => {
    setTxHistory(prev => {
      const next = [record, ...prev].slice(0, 20);
      // persist if we have a current address
      try {
        const addr = currentAddressRef.current;
        if (addr) window.localStorage.setItem(`txHistory:${addr}`, JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }, []);

  async function loadHistory(address: string) {
    try {
      const provider = getProvider();
      // start with any saved history
      const saved = window.localStorage.getItem(`txHistory:${address}`);
      let records: TxRecord[] = saved ? JSON.parse(saved) : [];

      const vault = await getVault(false);
      const cpe = await getCPE(false);

      // helper to convert event to TxRecord
      interface EventLike { blockNumber: number; transactionHash: string }
      async function evToRec(ev: EventLike, typeLabel: string, status: TxRecord['status']) {
        const blk = await provider.getBlock((ev as EventLike).blockNumber).catch(() => null);
        const ts = blk && (blk as { timestamp?: number }).timestamp ? Number((blk as { timestamp?: number }).timestamp) * 1000 : Date.now();
        return {
          type: typeLabel,
          hash: (ev as EventLike).transactionHash,
          etherscanUrl: `${SEPOLIA_EXPLORER}/tx/${(ev as EventLike).transactionHash}`,
          status,
          timestamp: ts,
        } as TxRecord;
      }

      // Vault events for this user
      const deps = await vault.queryFilter(vault.filters.Deposited(address), SEPOLIA_START_BLOCK);
      const approved = await vault.queryFilter(vault.filters.WithdrawalApproved(address), SEPOLIA_START_BLOCK);
      const denied = await vault.queryFilter(vault.filters.WithdrawalDenied(address), SEPOLIA_START_BLOCK);

      const depRecs = await Promise.all(deps.map((d: EventLike) => evToRec(d, 'Deposit', 'confirmed')));
      const apprRecs = await Promise.all(approved.map((d: EventLike) => evToRec(d, 'Withdraw Approved', 'approved')));
      const deniedRecs = await Promise.all(denied.map((d: EventLike) => evToRec(d, 'Withdraw Denied', 'denied')));

      records = [...records, ...depRecs, ...apprRecs, ...deniedRecs];

      // Address bind/unbind
      const binds = await cpe.queryFilter(cpe.filters.AddressBound(null, address), SEPOLIA_START_BLOCK);
      const unbinds = await cpe.queryFilter(cpe.filters.AddressUnbound(address), SEPOLIA_START_BLOCK);
      const bindRecs = await Promise.all(binds.map((d: EventLike) => evToRec(d, 'Policy Bound', 'confirmed')));
      const unbindRecs = await Promise.all(unbinds.map((d: EventLike) => evToRec(d, 'Policy Unbound', 'confirmed')));
      records = [...records, ...bindRecs, ...unbindRecs];

      // If we have a bound policy, include policy-level events
      const pid = await cpe.getPolicyForAddress(address);
      if (pid && pid !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
        const frozen = await cpe.queryFilter(cpe.filters.PolicyFrozen(pid), SEPOLIA_START_BLOCK);
        const unfrozen = await cpe.queryFilter(cpe.filters.PolicyUnfrozen(pid), SEPOLIA_START_BLOCK);
        const fRecs = await Promise.all(frozen.map((d: EventLike) => evToRec(d, 'Policy Frozen', 'confirmed')));
        const uRecs = await Promise.all(unfrozen.map((d: EventLike) => evToRec(d, 'Policy Unfrozen', 'confirmed')));
        records = [...records, ...fRecs, ...uRecs];
      }

      // dedupe by tx hash and sort newest first
      const byHash = new Map<string, TxRecord>();
      records.forEach(r => byHash.set(r.hash, r));
      const merged = Array.from(byHash.values()).sort((a, b) => b.timestamp - a.timestamp).slice(0, 50);
      setTxHistory(merged);
      try { window.localStorage.setItem(`txHistory:${address}`, JSON.stringify(merged)); } catch { /* ignore */ }
    } catch (err) {
      console.error('loadHistory:', err);
    }
  }

  function setCurrentAddress(address: string | null) {
    currentAddressRef.current = address;
  }

  // Write: Deposit

  const deposit = useCallback(async (amountEth: string) => {
    resetTx();
    try {
      setTxStatus('pending');
      const vault = await getVault();
      const tx = await vault.deposit({ value: parseEther(amountEth), gasLimit: 500_000 });
      setTxHash(tx.hash);
      await tx.wait();
      setTxStatus('success');
      pushHistory({
        type: 'Deposit',
        hash: tx.hash,
        etherscanUrl: `${SEPOLIA_EXPLORER}/tx/${tx.hash}`,
        status: 'confirmed',
        timestamp: Date.now(),
      });
    } catch (err: unknown) {
      setTxStatus('error');
      setTxError(err instanceof Error ? err.message : String(err));
    }
  }, [pushHistory]);

  // Write: Withdraw (FHE)

  const withdraw = useCallback(async (
    amountEth: string,
    userAddress: string,
    fhevmInstance: FhevmInstance,
  ) => {
    resetTx();
    try {
      const amountWei = parseEther(amountEth);
      const amountGwei = amountWei / 1_000_000_000n; // policy unit

      // Step 1 - FHE encrypt (for Vault verifier)
      setTxStatus('encrypting');
      await new Promise(resolve => setTimeout(resolve, 100));

      const input = fhevmInstance.createEncryptedInput(
        ADDRESSES.ConfidentialVault,
        userAddress,
      );
      input.add64(amountGwei);
      const enc = await input.encrypt();

      // Step 2 - send tx
      setTxStatus('pending');
      const vault = await getVault();
      const tx = await vault.withdraw(
        enc.handles[0],
        enc.inputProof,
        amountWei,
        { gasLimit: 3_000_000 },
      );
      setTxHash(tx.hash);
      const receipt = await tx.wait();

      // Check events to determine approve/deny
      const iface = vault.interface;
      const approvedTopic = iface.getEvent('WithdrawalApproved')?.topicHash;
      const deniedTopic = iface.getEvent('WithdrawalDenied')?.topicHash;
      const logs = receipt?.logs ?? [];
      const wasApproved = logs.some((l: { topics: string[] }) => l.topics[0] === approvedTopic);
      const wasDenied = logs.some((l: { topics: string[] }) => l.topics[0] === deniedTopic);

      setTxStatus(wasDenied ? 'denied' : 'success');
      pushHistory({
        type: 'Withdraw',
        hash: tx.hash,
        etherscanUrl: `${SEPOLIA_EXPLORER}/tx/${tx.hash}`,
        status: wasApproved ? 'approved' : wasDenied ? 'denied' : 'confirmed',
        timestamp: Date.now(),
      });
    } catch (err: unknown) {
      setTxStatus('error');
      setTxError(err instanceof Error ? err.message : String(err));
    }
  }, [pushHistory]);

  // Write: Compliant Transfer

  const compliantTransfer = useCallback(async (
    to: string,
    amountEth: string,
    requiredTier: number,
  ) => {
    resetTx();
    try {
      setTxStatus('pending');
      const vault = await getVault();
      const tx = await vault.compliantTransfer(
        to,
        parseEther(amountEth),
        requiredTier,
        { gasLimit: 800_000 },
      );
      setTxHash(tx.hash);
      await tx.wait();
      setTxStatus('success');
      pushHistory({
        type: 'Compliant Transfer',
        hash: tx.hash,
        etherscanUrl: `${SEPOLIA_EXPLORER}/tx/${tx.hash}`,
        status: 'confirmed',
        timestamp: Date.now(),
      });
    } catch (err: unknown) {
      setTxStatus('error');
      setTxError(err instanceof Error ? err.message : String(err));
    }
  }, [pushHistory]);

  // Write: Freeze / Unfreeze Policy

  const freezePolicy = useCallback(async (pid: string) => {
    resetTx();
    try {
      setTxStatus('pending');
      const cpe = await getCPE();
      const tx = await cpe.freezePolicy(pid, { gasLimit: 150_000 });
      setTxHash(tx.hash);
      await tx.wait();
      setTxStatus('success');
      pushHistory({
        type: 'Freeze Policy',
        hash: tx.hash,
        etherscanUrl: `${SEPOLIA_EXPLORER}/tx/${tx.hash}`,
        status: 'confirmed',
        timestamp: Date.now(),
      });
      // persist to current address if set
      try {
        const addr = currentAddressRef.current;
        if (addr) window.localStorage.setItem(`txHistory:${addr}`, JSON.stringify([{
          type: 'Freeze Policy', hash: tx.hash, etherscanUrl: `${SEPOLIA_EXPLORER}/tx/${tx.hash}`, status: 'confirmed', timestamp: Date.now()
        }, ...(JSON.parse(window.localStorage.getItem(`txHistory:${addr}`) || '[]') as TxRecord[])]));
      } catch { /* ignore */ }
    } catch (err: unknown) {
      setTxStatus('error');
      setTxError(err instanceof Error ? err.message : String(err));
    }
  }, [pushHistory]);

  const unfreezePolicy = useCallback(async (pid: string) => {
    resetTx();
    try {
      setTxStatus('pending');
      const cpe = await getCPE();
      const tx = await cpe.unfreezePolicy(pid, { gasLimit: 150_000 });
      setTxHash(tx.hash);
      await tx.wait();
      setTxStatus('success');
      pushHistory({
        type: 'Unfreeze Policy',
        hash: tx.hash,
        etherscanUrl: `${SEPOLIA_EXPLORER}/tx/${tx.hash}`,
        status: 'confirmed',
        timestamp: Date.now(),
      });
      try {
        const addr = currentAddressRef.current;
        if (addr) window.localStorage.setItem(`txHistory:${addr}`, JSON.stringify([{
          type: 'Unfreeze Policy', hash: tx.hash, etherscanUrl: `${SEPOLIA_EXPLORER}/tx/${tx.hash}`, status: 'confirmed', timestamp: Date.now()
        }, ...(JSON.parse(window.localStorage.getItem(`txHistory:${addr}`) || '[]') as TxRecord[])]));
      } catch { /* ignore */ }
    } catch (e: unknown) {
      setTxStatus('error');
      setTxError(e instanceof Error ? e.message : String(e));
    }
  }, [pushHistory]);

  // Write: Onboard (FHE)
  const onboardUser = useCallback(async (
    userAddress: string,
    policyName: string,
    fhevmInstance: FhevmInstance,
    customLimits?: {
      perTxLimit: bigint;
      dailyLimit: bigint;
      monthlyLimit: bigint;
      riskTier: number;
      complianceTier: number;
    }
  ) => {
    resetTx();
    try {
      // Step 1 - Generate unique policyId based on policyName
      const pid = solidityPackedKeccak256(['string'], [policyName]);

      const perTxLimit = customLimits?.perTxLimit ?? 1_000_000_000n;
      const dailyLimit = customLimits?.dailyLimit ?? 5_000_000_000n;
      const monthlyLimit = customLimits?.monthlyLimit ?? 10_000_000_000n;
      const riskTier = customLimits?.riskTier ?? 1;
      const complianceTier = customLimits?.complianceTier ?? 1;

      const p = getProvider();
      const signer = await p.getSigner();
      const signerAddress = await signer.getAddress();

      setTxStatus('encrypting');
      await new Promise(resolve => setTimeout(resolve, 100));

      const input = fhevmInstance.createEncryptedInput(
        ADDRESSES.ConfidentialPolicyEngine,
        signerAddress,
      );
      input.add64(perTxLimit);
      input.add64(dailyLimit);
      input.add64(monthlyLimit);
      input.add8(riskTier);
      input.add8(complianceTier);
      const enc = await input.encrypt();

      setTxStatus('pending');
      const cpe = await getCPE();

      // Step 2 - Create Policy
      const tx1 = await cpe.createPolicy(
        pid,
        enc.handles[0],
        enc.handles[1],
        enc.handles[2],
        enc.handles[3],
        enc.handles[4],
        enc.inputProof,
        { gasLimit: 5_000_000 }
      );
      setTxHash(tx1.hash);
      await tx1.wait();

      try {
        window.localStorage.setItem(`policyName:${pid.toLowerCase()}`, policyName);
      } catch { /* ignore */ }

      // Step 3 - Bind Address
      const tx2 = await cpe.bindAddress(pid, userAddress, { gasLimit: 200_000 });
      setTxHash(tx2.hash);
      await tx2.wait();

      setTxStatus('success');
      pushHistory({
        type: 'Onboard',
        hash: tx2.hash,
        etherscanUrl: `${SEPOLIA_EXPLORER}/tx/${tx2.hash}`,
        status: 'confirmed',
        timestamp: Date.now(),
      });
    } catch (e: unknown) {
      setTxStatus('error');
      setTxError(e instanceof Error ? e.message : String(e));
    }
  }, [pushHistory]);

  const bindAddress = useCallback(async (pid: string, subject: string) => {
    resetTx();
    try {
      setTxStatus('pending');
      const cpe = await getCPE();
      const tx = await cpe.bindAddress(pid, subject, { gasLimit: 200_000 });
      setTxHash(tx.hash);
      await tx.wait();
      setTxStatus('success');
      pushHistory({
        type: 'Policy Bound',
        hash: tx.hash,
        etherscanUrl: `${SEPOLIA_EXPLORER}/tx/${tx.hash}`,
        status: 'confirmed',
        timestamp: Date.now(),
      });
    } catch (e: unknown) {
      setTxStatus('error');
      setTxError(e instanceof Error ? e.message : String(e));
    }
  }, [pushHistory]);

  // Write: DAO Functions
  const daoDeposit = useCallback(async (amountEth: string) => {
    resetTx();
    try {
      setTxStatus('pending');
      const p = getProvider();
      const runner = await p.getSigner();
      const dao = new Contract(selectedDAO, DAO_ABI, runner);
      const tx = await dao.deposit({ value: parseEther(amountEth), gasLimit: 500_000 });
      setTxHash(tx.hash);
      await tx.wait();
      setTxStatus('success');
      pushHistory({
        type: 'DAO Deposit',
        hash: tx.hash,
        etherscanUrl: `${SEPOLIA_EXPLORER}/tx/${tx.hash}`,
        status: 'confirmed',
        timestamp: Date.now(),
      });
    } catch (e: unknown) {
      setTxStatus('error');
      setTxError(e instanceof Error ? e.message : String(e));
    }
  }, [pushHistory, selectedDAO]);

  const daoWithdraw = useCallback(async (
    amountEth: string,
    userAddress: string,
    fhevmInstance: FhevmInstance,
  ) => {
    resetTx();
    try {
      const amountWei = parseEther(amountEth);
      const amountGwei = amountWei / 1_000_000_000n;

      setTxStatus('encrypting');
      await new Promise(resolve => setTimeout(resolve, 100));

      const input = fhevmInstance.createEncryptedInput(
        selectedDAO,
        userAddress,
      );
      input.add64(amountGwei);
      const enc = await input.encrypt();

      setTxStatus('pending');
      const p = getProvider();
      const runner = await p.getSigner();
      const dao = new Contract(selectedDAO, DAO_ABI, runner);
      const tx = await dao.withdraw(
        enc.handles[0],
        enc.inputProof,
        amountWei,
        { gasLimit: 3_000_000 },
      );
      setTxHash(tx.hash);
      await tx.wait();

      setTxStatus('success');
      pushHistory({
        type: 'DAO Withdrawal',
        hash: tx.hash,
        etherscanUrl: `${SEPOLIA_EXPLORER}/tx/${tx.hash}`,
        status: 'approved',
        timestamp: Date.now(),
      });
    } catch (e: unknown) {
      setTxStatus('error');
      setTxError(e instanceof Error ? e.message : String(e));
    }
  }, [pushHistory, selectedDAO]);

  const createDAO = useCallback(async (name: string) => {
    resetTx();
    try {
      setTxStatus('pending');
      const p = getProvider();
      const runner = await p.getSigner();
      const factory = new Contract(ADDRESSES.DAOFactory, DAO_FACTORY_ABI, runner);

      const tx = await factory.createDAO(ADDRESSES.CPEGateway, name, { gasLimit: 5_000_000 });
      setTxHash(tx.hash);
      const receipt = await tx.wait();

      // Extract the new DAO address from the event
      // Event: DAOCreated(address indexed daoAddress, string name, address indexed creator)
      const iface = factory.interface;
      const log = receipt?.logs.find((l: { address: string }) => l.address === ADDRESSES.DAOFactory);
      const daoAddr = log ? iface.parseLog(log)?.args[0] : null;

      setTxStatus('success');
      pushHistory({
        type: 'Create DAO',
        hash: tx.hash,
        etherscanUrl: `${SEPOLIA_EXPLORER}/tx/${tx.hash}`,
        status: 'confirmed',
        timestamp: Date.now(),
      });
      return daoAddr;
    } catch (e: unknown) {
      setTxStatus('error');
      setTxError(e instanceof Error ? e.message : String(e));
    }
  }, [pushHistory]);

  const addDAOMember = useCallback(async (member: string) => {
    resetTx();
    try {
      setTxStatus('pending');
      const p = getProvider();
      const runner = await p.getSigner();
      const dao = new Contract(selectedDAO, DAO_ABI, runner);
      const tx = await dao.addMember(member, { gasLimit: 200_000 });
      setTxHash(tx.hash);
      await tx.wait();
      setTxStatus('success');
      pushHistory({
        type: 'DAO Member Added',
        hash: tx.hash,
        etherscanUrl: `${SEPOLIA_EXPLORER}/tx/${tx.hash}`,
        status: 'confirmed',
        timestamp: Date.now(),
      });
    } catch (e: unknown) {
      setTxStatus('error');
      setTxError(e instanceof Error ? e.message : String(e));
    }
  }, [pushHistory, selectedDAO]);

  const removeDAOMember = useCallback(async (member: string) => {
    resetTx();
    try {
      setTxStatus('pending');
      const p = getProvider();
      const runner = await p.getSigner();
      const dao = new Contract(selectedDAO, DAO_ABI, runner);
      const tx = await dao.removeMember(member, { gasLimit: 200_000 });
      setTxHash(tx.hash);
      await tx.wait();
      setTxStatus('success');
      pushHistory({
        type: 'DAO Member Removed',
        hash: tx.hash,
        etherscanUrl: `${SEPOLIA_EXPLORER}/tx/${tx.hash}`,
        status: 'confirmed',
        timestamp: Date.now(),
      });
    } catch (e: unknown) {
      setTxStatus('error');
      setTxError(e instanceof Error ? e.message : String(e));
    }
  }, [pushHistory, selectedDAO]);

  return {
    // State
    balance, daoBalance, selectedDAO, hasPolicy, policyId, policyMeta,
    txStatus, txHash, txError, txHistory,
    // Actions
    refreshBalance, refreshTreasury, refreshPolicy,
    setSelectedDAO,
    onboardUser,
    bindAddress,
    deposit, withdraw, daoDeposit, daoWithdraw, compliantTransfer,
    freezePolicy, unfreezePolicy,
    createDAO,
    addDAOMember,
    removeDAOMember,
    resetTx,
    // Persistence helpers
    loadHistory, setCurrentAddress,
  };
}
