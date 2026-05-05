// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)
import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { SEPOLIA_EXPLORER } from '../contracts/addresses';
import { useVault } from '../hooks/useVault';
import { useFhevm } from '../hooks/useFhevm';

/* Small shared components */

function TxBanner({ status, txHash, error }: { status: string; txHash: string | null; error: string | null }) {
  if (status === 'idle') return null;

  const map: Record<string, { cls: string; msg: string }> = {
    encrypting: { cls: 'encrypting', msg: '🔐 FHE-encrypting your amount…' },
    pending: { cls: 'pending', msg: '⏳ Transaction pending…' },
    success: { cls: 'success', msg: '✅ Transaction confirmed!' },
    denied: { cls: 'denied', msg: '🚫 Policy denied - FHE check failed (over limit or frozen).' },
    error: { cls: 'error', msg: `❌ ${error ?? 'Transaction failed.'}` },
  };

  const { cls, msg } = map[status] ?? map.error;
  return (
    <div className={`tx-banner tx-banner--${cls}`}>
      <span>{msg}</span>
      {txHash && (
        <a href={`${SEPOLIA_EXPLORER}/tx/${txHash}`} target="_blank" rel="noreferrer">
          View on Etherscan ↗
        </a>
      )}
    </div>
  );
}

/* VaultDashboard */
export default function VaultDashboard() {
  const { address } = useAccount();
  const vault = useVault();
  const fhevm = useFhevm();

  // local form state
  const [depositAmt, setDepositAmt] = useState('');
  const [withdrawAmt, setWithdrawAmt] = useState('');
  const [transferTo, setTransferTo] = useState('');
  const [transferAmt, setTransferAmt] = useState('');
  const [transferTier, setTransferTier] = useState('1');

  // Load data on mount
  useEffect(() => {
    if (!address) return;
    vault.setCurrentAddress(address);
    vault.refreshBalance(address);
    vault.refreshPolicy(address);
    vault.loadHistory(address);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  const isBusy = vault.txStatus !== 'idle';
  const isAdmin = vault.policyMeta &&
    (vault.policyMeta.policyAdmin as string)?.toLowerCase() === address?.toLowerCase();

  /* Handlers */

  async function handleDeposit() {
    if (!depositAmt) return;
    await vault.deposit(depositAmt);
    setDepositAmt('');
    if (address) { vault.refreshBalance(address); }
  }

  async function handleWithdraw() {
    if (!withdrawAmt || !address || !fhevm.instance) return;
    await vault.withdraw(withdrawAmt, address, fhevm.instance);
    setWithdrawAmt('');
    if (address) { vault.refreshBalance(address); }
  }

  async function handleTransfer() {
    if (!transferTo || !transferAmt) return;
    await vault.compliantTransfer(transferTo, transferAmt, Number(transferTier));
    setTransferTo('');
    setTransferAmt('');
    if (address) { vault.refreshBalance(address); }
    try {
      // also refresh recipient balance in-case the recipient is being viewed
      vault.refreshBalance(transferTo);
    } catch {
      // ignore errors (e.g., invalid address format)
    }
  }

  async function handleFreeze() {
    if (!vault.policyId) return;
    await vault.freezePolicy(vault.policyId);
    if (address) {
      await vault.refreshPolicy(address);
      await vault.loadHistory(address);
    }
  }

  async function handleUnfreeze() {
    if (!vault.policyId) return;
    await vault.unfreezePolicy(vault.policyId);
    if (address) {
      await vault.refreshPolicy(address);
      await vault.loadHistory(address);
    }
  }

  /* Render */
  return (
    <div className="dashboard fade-up">
      <div className="dashboard__topbar">
        <h1 className="dashboard__title">Vault Dashboard</h1>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => {
            // User expects a full reload — perform a hard refresh of the page.
            // This will re-run the app bootstrap, re-initialize hooks, and
            // fetch latest on-chain state.
            if (!address) return;
            window.location.reload();
          }}
        >
          ↻ Refresh
        </button>
      </div>

      <div className="dashboard__grid">

        {/* 1. Balance */}
        <div className="card card--accent">
          <div className="panel-title">💰 Vault Balance</div>
          <div className="balance-val">
            {vault.balance !== null ? `${Number(vault.balance).toFixed(6)}` : '-'}
          </div>
          <div className="balance-sub">ETH · Sepolia</div>
          <div className="divider" />
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Address: {address?.slice(0, 6)}…{address?.slice(-4)}
          </div>
        </div>

        {/*  2. Policy Status */}
        <div className="card">
          <div className="panel-title">🛡️ Policy Status</div>
          {vault.hasPolicy === null ? (
            <div className="balance-sub">Loading…</div>
          ) : vault.hasPolicy ? (
            <dl className="policy-table">
              <div className="policy-row">
                <dt>Status</dt>
                <dd><span className="badge badge-ok">Active</span></dd>
              </div>
              <div className="policy-row">
                <dt>Admin</dt>
                <dd style={{ fontSize: 12 }}>
                  {(vault.policyMeta?.policyAdmin as string)?.slice(0, 8)}…
                </dd>
              </div>
              <div className="policy-row">
                <dt>Daily resets</dt>
                <dd style={{ fontSize: 12 }}>
                  {vault.policyMeta?.dailyResetAt
                    ? new Date(vault.policyMeta.dailyResetAt as string).toLocaleDateString()
                    : '-'}
                </dd>
              </div>
              <div className="policy-row">
                <dt>Policy ID</dt>
                <dd style={{ fontSize: 11 }}>{vault.policyId?.slice(0, 14)}…</dd>
              </div>
            </dl>
          ) : (
            <div>
              <span className="badge badge-warn" style={{ marginBottom: 8, display: 'inline-flex' }}>
                No Policy Bound
              </span>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>
                Ask the CPE admin to bind your address to a policy before withdrawing.
              </p>
            </div>
          )}
        </div>

        {/* 3. Deposit */}
        <div className="card">
          <div className="panel-title">⬇️ Deposit ETH</div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
            Deposits are unrestricted - no policy check required.
          </p>
          <div className="field" style={{ marginBottom: 12 }}>
            <label>Amount (ETH)</label>
            <input
              type="number"
              placeholder="0.05"
              min="0"
              step="0.001"
              value={depositAmt}
              onChange={e => setDepositAmt(e.target.value)}
            />
          </div>
          <button
            className="btn btn-primary"
            onClick={handleDeposit}
            disabled={isBusy || !depositAmt}
            style={{ width: '100%' }}
          >
            {vault.txStatus === 'pending' ? <span className="spin">⟳</span> : 'Deposit'}
          </button>
          <TxBanner status={vault.txStatus} txHash={vault.txHash} error={vault.txError} />
        </div>

        {/* 4. Withdraw (FHE) */}
        <div className="card card--accent">
          <div className="panel-title">
            ⬆️ Withdraw
            <span className="badge badge-fhe">🔐 FHE Encrypted</span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
            Amount is encrypted client-side via Zama Relayer SDK before the transaction
            is sent. The policy evaluates in ciphertext on-chain.
          </p>

          {fhevm.loading && (
            <div className="tx-banner tx-banner--encrypting" style={{ marginBottom: 12 }}>
              <span className="spin">⟳</span> Initialising FHE WASM…
            </div>
          )}
          {fhevm.error && (
            <div className="tx-banner tx-banner--error" style={{ marginBottom: 12 }}>
              FHE init failed: {fhevm.error}
            </div>
          )}

          <div className="field" style={{ marginBottom: 12 }}>
            <label>Amount (ETH)</label>
            <input
              type="number"
              placeholder="0.01"
              min="0"
              step="0.001"
              value={withdrawAmt}
              onChange={e => setWithdrawAmt(e.target.value)}
            />
          </div>
          <button
            className="btn btn-primary"
            onClick={handleWithdraw}
            disabled={isBusy || !withdrawAmt || fhevm.loading || !fhevm.instance}
            style={{ width: '100%' }}
          >
            {vault.txStatus === 'encrypting'
              ? <><span className="spin">⟳</span> Encrypting…</>
              : vault.txStatus === 'pending'
                ? <><span className="spin">⟳</span> Sending…</>
                : 'Withdraw (FHE)'}
          </button>
          <TxBanner status={vault.txStatus} txHash={vault.txHash} error={vault.txError} />
        </div>

        {/* 5. Compliant Transfer */}
        <div className="card">
          <div className="panel-title">🔄 Compliant Transfer</div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
            Transfers vault balance to another address if your encrypted compliance
            tier meets the required level. Checked fully on-chain.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
            <div className="field">
              <label>Recipient Address</label>
              <input
                type="text"
                placeholder="0x…"
                value={transferTo}
                onChange={e => setTransferTo(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Amount (ETH)</label>
              <input
                type="number"
                placeholder="0.01"
                min="0"
                step="0.001"
                value={transferAmt}
                onChange={e => setTransferAmt(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Required Tier (min)</label>
              <select value={transferTier} onChange={e => setTransferTier(e.target.value)}>
                <option value="1">Tier 1 - Basic KYC</option>
                <option value="2">Tier 2 - Accredited Investor</option>
                <option value="3">Tier 3 - Institutional</option>
              </select>
            </div>
          </div>
          <button
            className="btn btn-outline"
            onClick={handleTransfer}
            disabled={isBusy || !transferTo || !transferAmt}
            style={{ width: '100%' }}
          >
            {vault.txStatus === 'pending' ? <span className="spin">⟳</span> : 'Transfer'}
          </button>
          <TxBanner status={vault.txStatus} txHash={vault.txHash} error={vault.txError} />
        </div>

        {/* 6. Policy Admin */}
        <div className="card">
          <div className="panel-title">
            ⚙️ Policy Admin
            {!isAdmin && <span className="badge badge-muted" style={{ marginLeft: 8 }}>Admin only</span>}
          </div>
          {!vault.hasPolicy ? (
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No policy bound to this address.</p>
          ) : !isAdmin ? (
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Only the policy admin can freeze or unfreeze. Your address is not the admin of this policy.
            </p>
          ) : (
            <>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
                Freeze/unfreeze is stored as an encrypted boolean - indistinguishable
                from any other state write on-chain.
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      className="btn btn-outline"
                      onClick={handleFreeze}
                      disabled={isBusy || !vault.policyId || (vault.policyMeta as { frozen?: boolean } | null)?.frozen === true}
                      style={{ flex: 1 }}
                    >
                      {vault.txStatus === 'pending' ? <span className="spin">⟳</span> : '🧊 Freeze'}
                    </button>
                    <button
                      className="btn btn-primary"
                      onClick={handleUnfreeze}
                      disabled={isBusy || !vault.policyId || (vault.policyMeta as { frozen?: boolean } | null)?.frozen === false}
                      style={{ flex: 1 }}
                    >
                      {vault.txStatus === 'pending' ? <span className="spin">⟳</span> : '☀️ Unfreeze'}
                    </button>
              </div>
              <TxBanner status={vault.txStatus} txHash={vault.txHash} error={vault.txError} />
            </>
          )}
        </div>

        {/* 7. TX History */}
        <div className="card span-2">
          <div className="panel-title">📜 Transaction History</div>
          {vault.txHistory.length === 0 ? (
            <div className="tx-empty">No transactions yet - make your first deposit or withdrawal.</div>
          ) : (
            <div className="tx-list">
              {vault.txHistory.map((tx, i) => (
                <div key={i} className="tx-item">
                  <span className="tx-item__type">{tx.type}</span>
                  <span className={`badge ${tx.status === 'approved' ? 'badge-ok'
                    : tx.status === 'denied' ? 'badge-err'
                      : 'badge-muted'
                    }`}>
                    {tx.status}
                  </span>
                  <span className="tx-item__time">
                    {new Date(tx.timestamp).toLocaleTimeString()}
                  </span>
                  <a
                    href={tx.etherscanUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="tx-item__link"
                  >
                    Etherscan ↗
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
