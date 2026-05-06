// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)
import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { SEPOLIA_EXPLORER } from '../contracts/addresses';
import { useVault, getProvider } from '../hooks/useVault';
import { useFhevm } from '../hooks/useFhevm';
import { useDiscovery } from '../hooks/useDiscovery';
import { Contract } from 'ethers';
import { ADDRESSES } from '../contracts/addresses';
import { REGISTRY_ABI, LOGGER_ABI, CPE_ABI } from '../contracts/abis';
import {
  User,
  Building2,
  ScrollText,
  ShieldCheck,
  LockKeyhole,
  Loader2,
  CheckCircle2,
  XCircle,
  Wallet,
  ArrowDownToLine,
  ArrowUpFromLine,
  Sparkles,
  History,
  Snowflake,
  Activity,
  RefreshCw,
} from 'lucide-react';

/* Small shared components */

function TxBanner({ status, txHash, error }: { status: string; txHash: string | null; error: string | null }) {
  if (status === 'idle') return null;

  const iconStyle = { width: 16, height: 16, display: 'inline', verticalAlign: 'middle', marginRight: 6 };
  const map: Record<string, { cls: string; icon: React.ReactNode; msg: string }> = {
    encrypting: { cls: 'encrypting', icon: <LockKeyhole style={iconStyle} aria-hidden="true" />, msg: 'FHE-encrypting your amount…' },
    pending: { cls: 'pending', icon: <Loader2 style={{ ...iconStyle, animation: 'spin 1s linear infinite' }} aria-hidden="true" />, msg: 'Transaction pending…' },
    success: { cls: 'success', icon: <CheckCircle2 style={iconStyle} aria-hidden="true" />, msg: 'Transaction confirmed!' },
    denied: { cls: 'denied', icon: <XCircle style={iconStyle} aria-hidden="true" />, msg: 'Policy denied - FHE check failed (over limit or frozen).' },
    error: { cls: 'error', icon: <XCircle style={iconStyle} aria-hidden="true" />, msg: error ?? 'Transaction failed.' },
  };

  const { cls, icon, msg } = map[status] ?? map.error;
  return (
    <div className={`tx-banner tx-banner--${cls}`}>
      <span style={{ display: 'flex', alignItems: 'center' }}>
        {icon}
        {msg}
      </span>
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
  const discovery = useDiscovery();

  // local UI state
  const [activeTab, setactiveTab] = useState<'personal' | 'dao' | 'policies' | 'admin'>('personal');
  const [isScanning, setIsScanning] = useState(true);

  // local form state
  const [depositAmt, setDepositAmt] = useState('');
  const [withdrawAmt, setWithdrawAmt] = useState('');

  // local DAO form state
  const [daoDepositAmt, setDaoDepositAmt] = useState('');
  const [daoWithdrawAmt, setDaoWithdrawAmt] = useState('');
  const [newDaoName, setNewDaoName] = useState('');

  // local Admin form state
  const [manageSubject, setManageSubject] = useState('');
  const [managePolicyId, setManagePolicyId] = useState('');
  const [healthStatus, setHealthStatus] = useState<Record<string, boolean>>({});

  // Auto-Discovery on mount
  useEffect(() => {
    async function init() {
      if (!address) return;
      setIsScanning(true);

      // 1. Scan for DAOs
      const found = await discovery.scanForDAOs(address);

      // 2. Auto-select first DAO found (if any)
      if (found.length > 0) {
        vault.setSelectedDAO(found[0].address);
        setactiveTab(found[0].role === 'admin' ? 'admin' : 'dao');
      }

      // 3. Load basic data
      vault.refreshBalance(address);
      vault.refreshPolicy(address);
      vault.refreshTreasury();
      setIsScanning(false);
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  const isBusy = vault.txStatus !== 'idle';
  const isAdmin = vault.policyMeta &&
    (vault.policyMeta.policyAdmin as string)?.toLowerCase() === address?.toLowerCase();

  /* Handlers */

  async function handleOnboard() {
    if (!address || !fhevm.instance) return;
    await vault.onboardUser(address, fhevm.instance);
    if (address) vault.refreshPolicy(address);
  }

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
    if (address) vault.refreshPolicy(address);
  }

  async function handleDAODeposit() {
    if (!daoDepositAmt) return;
    await vault.daoDeposit(daoDepositAmt);
    setDaoDepositAmt('');
    vault.refreshTreasury();
  }

  async function handleDAOWithdraw() {
    if (!daoWithdrawAmt || !address || !fhevm.instance) return;
    await vault.daoWithdraw(daoWithdrawAmt, address, fhevm.instance);
    setDaoWithdrawAmt('');
    vault.refreshTreasury();
  }

  async function handleBindUser() {
    if (!manageSubject || !managePolicyId) return;
    await vault.onboardUser(manageSubject, fhevm.instance!);
    setManageSubject('');
    setManagePolicyId('');
  }

  async function checkHealth() {
    try {
      const p = await getProvider();
      const registry = new Contract(ADDRESSES.PolicyRegistry, REGISTRY_ABI, p);
      const logger = new Contract(ADDRESSES.AuditLogger, LOGGER_ABI, p);
      const cpe = new Contract(ADDRESSES.ConfidentialPolicyEngine, CPE_ABI, p);

      const isWriter = await registry.isAuthorizedWriter(ADDRESSES.ConfidentialPolicyEngine);
      const isLogger = await logger.isAuthorizedLogger(ADDRESSES.ConfidentialPolicyEngine);
      const isGateway = await cpe.isAuthorizedCaller(ADDRESSES.CPEGateway);

      setHealthStatus({
        registry: isWriter,
        logger: isLogger,
        gateway: isGateway,
      });
    } catch (e) {
      console.error('health check failed', e);
    }
  }

  async function handleCreateDAO() {
    if (!newDaoName) return;
    const addr = await vault.createDAO(newDaoName);
    if (addr) {
      setNewDaoName('');
      if (address) discovery.scanForDAOs(address);
    }
  }

  /* Render */
  if (isScanning) {
    return (
      <div className="dashboard fade-up" style={{ textAlign: 'center', paddingTop: 100 }}>
        <Loader2 className="spin" size={40} aria-label="Loading" />
        <h2 style={{ marginTop: 24 }}>Discovering your Confidential DAOs...</h2>
        <p style={{ color: 'var(--text-muted)' }}>Scanning the CPE registry for your active policies.</p>
      </div>
    );
  }

  return (
    <div className="dashboard fade-up">
      <div className="dashboard__topbar">
        <div>
          <h1 className="dashboard__title">Vault Dashboard</h1>

          <div style={{ display: 'flex', gap: 8, marginTop: 12, overflowX: 'auto', paddingBottom: 4 }}>
            <button
              className={`btn btn-sm ${activeTab === 'personal' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setactiveTab('personal')}
            >
              <User size={14} aria-hidden="true" style={{ marginRight: 4 }} />
              <span>Personal</span>
            </button>
            <button
              className={`btn btn-sm ${activeTab === 'dao' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setactiveTab('dao')}
            >
              <Building2 size={14} aria-hidden="true" style={{ marginRight: 4 }} />
              <span>DAO</span>
            </button>
            <button
              className={`btn btn-sm ${activeTab === 'policies' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setactiveTab('policies')}
            >
              <ScrollText size={14} aria-hidden="true" style={{ marginRight: 4 }} />
              <span>Policies</span>
            </button>
            {isAdmin && (
              <button
                className={`btn btn-sm ${activeTab === 'admin' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setactiveTab('admin')}
              >
                <ShieldCheck size={14} aria-hidden="true" style={{ marginRight: 4 }} />
                <span>Admin</span>
              </button>
            )}
          </div>

          {discovery.foundDAOs.length > 1 && (
            <div style={{ marginTop: 12 }}>
              <select
                className="btn-sm"
                value={vault.selectedDAO}
                onChange={(e) => {
                  vault.setSelectedDAO(e.target.value);
                  const role = discovery.foundDAOs.find(d => d.address === e.target.value)?.role;
                  if (role) setactiveTab(role === 'admin' ? 'admin' : 'dao');
                }}
                style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: 4, padding: '4px 8px' }}
              >
                {discovery.foundDAOs.map(d => (
                  <option key={d.address} value={d.address}>
                    Active Policy: {d.name} ({d.address.slice(0, 8)}...)
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => {
            if (!address) return;
            discovery.scanForDAOs(address);
            vault.refreshBalance(address);
            vault.refreshPolicy(address);
            vault.refreshTreasury();
          }}
          style={{ display: 'flex', alignItems: 'center', gap: 4 }}
        >
          <RefreshCw size={14} aria-hidden="true" />
          <span>Refresh</span>
        </button>
      </div>

      <div className="dashboard__grid">
        {/* 1. Account Info */}
        <div className="card">
          <div className="panel-title"><User size={16} aria-hidden="true" style={{ marginRight: 6 }} />Account Balance</div>
          <div className="balance-val">{vault.balance ?? '0.00'} ETH</div>
          <div className="balance-sub">Internal Vault Ledger</div>
        </div>

        {/* 2. DAO Treasury */}
        <div className="card">
          <div className="panel-title"><Building2 size={16} aria-hidden="true" style={{ marginRight: 6 }} />DAO Treasury</div>
          <div className="balance-val">{vault.daoBalance ?? '0.00'} ETH</div>
          <div className="balance-sub">Shared Corporate Pool</div>
        </div>

        {/* 3. Policy Info */}
        <div className="card span-2 card--accent">
          <div className="panel-title"><ShieldCheck size={16} aria-hidden="true" style={{ marginRight: 6 }} />Policy Enforcement (FHE)</div>
          {!vault.hasPolicy ? (
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
                You don't have an active policy bound to this vault.
              </p>
              <button className="btn btn-primary" onClick={handleOnboard} disabled={isBusy}>
                Onboard & Create Policy
              </button>
            </div>
          ) : (
            <div className="policy-table">
              <div className="policy-row">
                <dt>Policy ID</dt>
                <dd>{vault.policyId?.slice(0, 24)}...</dd>
              </div>
              <div className="policy-row">
                <dt>Status</dt>
                <dd>
                  <span className={`badge ${vault.policyMeta?.frozen ? 'badge-err' : 'badge-ok'}`}>
                    {vault.policyMeta?.frozen ? 'FROZEN' : 'ACTIVE'}
                  </span>
                </dd>
              </div>
              <div className="policy-row">
                <dt>Last Evaluation</dt>
                <dd>{vault.policyMeta?.updatedAt ? new Date(vault.policyMeta.updatedAt as string).toLocaleString() : 'Never'}</dd>
              </div>
              <div className="policy-row">
                <dt>Compliance Tier</dt>
                <dd><span className="badge badge-fhe">ENCRYPTED</span></dd>
              </div>
            </div>
          )}
        </div>

        {/* Tab Content */}
        {activeTab === 'personal' && (
          <>
            <div className="card card--accent">
              <div className="panel-title"><Wallet size={16} aria-hidden="true" style={{ marginRight: 6 }} />Personal Balance</div>
              <div className="balance-val">
                {vault.balance !== null ? `${Number(vault.balance).toFixed(6)}` : '-'}
              </div>
              <div className="balance-sub">ETH · Sepolia</div>
              <div className="divider" />
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Your private wallet within the vault.
              </div>
            </div>

            <div className="card">
              <div className="panel-title"><ShieldCheck size={16} aria-hidden="true" style={{ marginRight: 6 }} />Policy Status</div>
              {vault.hasPolicy === null ? (
                <div className="balance-sub">Loading…</div>
              ) : vault.hasPolicy ? (
                <dl className="policy-table">
                  <div className="policy-row">
                    <dt>Status</dt>
                    <dd><span className="badge badge-ok">Active</span></dd>
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
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 8, marginBottom: 16 }}>
                    Initialize your demo account to set up your encrypted security limits.
                  </p>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={handleOnboard}
                    disabled={isBusy || fhevm.loading || !fhevm.instance}
                    style={{ width: '100%' }}
                  >
                    Initialize Account
                  </button>
                </div>
              )}
            </div>

            <div className="card">
              <div className="panel-title"><ArrowDownToLine size={16} aria-hidden="true" style={{ marginRight: 6 }} />Deposit ETH</div>
              <div className="field" style={{ marginBottom: 12 }}>
                <input
                  type="number"
                  placeholder="0.05"
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
                Deposit
              </button>
            </div>

            <div className="card card--accent">
              <div className="panel-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center' }}>
                  <ArrowUpFromLine size={16} aria-hidden="true" style={{ marginRight: 6 }} />
                  Withdraw
                </span>

                <span className="badge badge-fhe">
                  <LockKeyhole size={12} aria-hidden="true" style={{ marginRight: 4 }} />
                  FHE
                </span>
              </div>
              <div className="field" style={{ marginBottom: 12 }}>
                <input
                  type="number"
                  placeholder="0.01"
                  value={withdrawAmt}
                  onChange={e => setWithdrawAmt(e.target.value)}
                />
              </div>
              <button
                className="btn btn-primary"
                onClick={handleWithdraw}
                disabled={isBusy || !withdrawAmt || !fhevm.instance}
                style={{ width: '100%' }}
              >
                {fhevm.loading ? 'Initializing FHE...' : 'Withdraw (FHE)'}
              </button>
            </div>
          </>
        )}

        {activeTab === 'dao' && (
          <>
            <div className="card card--accent span-2">
              <div className="panel-title"><Building2 size={16} aria-hidden="true" style={{ marginRight: 6 }} />DAO Treasury Pool</div>
              <div className="balance-val">
                {vault.daoBalance !== null ? `${Number(vault.daoBalance).toFixed(4)}` : '0.0000'}
              </div>
              <div className="balance-sub">Total Shared ETH Reserves</div>
              <div className="divider" />
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                This is a shared treasury. Anyone can deposit, but withdrawals are
                privately gated. Your personal FHE policy determines how much you
                can spend from this pool.
              </p>
            </div>

            <div className="card">
              <div className="panel-title"><Building2 size={16} aria-hidden="true" style={{ marginRight: 6 }} />Contribute to DAO</div>
              <div className="field" style={{ marginBottom: 12 }}>
                <input
                  type="number"
                  placeholder="0.1"
                  value={daoDepositAmt}
                  onChange={e => setDaoDepositAmt(e.target.value)}
                />
              </div>
              <button
                className="btn btn-primary"
                onClick={handleDAODeposit}
                disabled={isBusy || !daoDepositAmt}
                style={{ width: '100%' }}
              >
                Contribute
              </button>
            </div>

            <div className="card card--accent">
              <div className="panel-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center' }}>
                  <Building2 size={16} aria-hidden="true" style={{ marginRight: 6 }} />Spend from DAO
                </span>
                <span className="badge badge-fhe">
                  <LockKeyhole size={12} aria-hidden="true" style={{ marginRight: 4 }} />
                  FHE
                </span>
              </div>
              <div className="field" style={{ marginBottom: 12 }}>
                <input
                  type="number"
                  placeholder="0.01"
                  value={daoWithdrawAmt}
                  onChange={e => setDaoWithdrawAmt(e.target.value)}
                />
              </div>
              <button
                className="btn btn-primary"
                onClick={handleDAOWithdraw}
                disabled={isBusy || !daoWithdrawAmt || !fhevm.instance}
                style={{ width: '100%' }}
              >
                {fhevm.loading ? 'Initializing FHE...' : 'Withdraw from DAO'}
              </button>
            </div>

            {/* Create DAO CTA */}
            <div className="card span-2" style={{ border: '1px dashed var(--accent)', background: 'rgba(168, 85, 247, 0.05)' }}>
              <div className="panel-title"><Sparkles size={16} aria-hidden="true" style={{ marginRight: 6 }} />Create Your Own Institution</div>
              <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                <input
                  placeholder="DAO Name (e.g. Zama Investors)"
                  value={newDaoName}
                  onChange={e => setNewDaoName(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button className="btn btn-primary" onClick={handleCreateDAO} disabled={!newDaoName}>
                  Deploy New DAO
                </button>
              </div>
            </div>
          </>
        )}

        {activeTab === 'policies' && (
          <div className="card span-2 fade-up">
            <div className="panel-title"><ScrollText size={16} aria-hidden="true" style={{ marginRight: 6 }} />Discovered Policies & DAOs</div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
              These are the confidential DAOs where you are a member or admin.
              Click "Switch" to view specific treasury and admin controls.
            </p>

            {discovery.foundDAOs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0', background: 'rgba(0,0,0,0.2)', borderRadius: 8 }}>
                <p style={{ color: 'var(--text-muted)' }}>No policies discovered yet.</p>
                <button className="btn btn-sm btn-outline" style={{ marginTop: 12 }} onClick={() => address && discovery.scanForDAOs(address)}>
                  Scan Registry
                </button>
              </div>
            ) : (
              <div className="tx-list">
                {discovery.foundDAOs.map(dao => (
                  <div key={dao.address} className="tx-item" style={{ padding: '16px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{dao.name}</span>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <code style={{ fontSize: 11, color: 'var(--text-muted)' }}>{dao.address.slice(0, 12)}...</code>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: 4 }}>
                          Created: {new Date(dao.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span className={`badge ${dao.role === 'admin' ? 'badge-fhe' : 'badge-ok'}`}>
                        {dao.role === 'admin' ? 'Policy Admin' : 'Member'}
                      </span>
                      {vault.selectedDAO === dao.address ? (
                        <span className="badge badge-muted">Active</span>
                      ) : (
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => {
                            vault.setSelectedDAO(dao.address);
                            setactiveTab(dao.role === 'admin' ? 'admin' : 'dao');
                          }}
                        >
                          Switch
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'admin' && (
          <>
            <div className="card span-2">
              <div className="panel-title"><ShieldCheck size={16} aria-hidden="true" style={{ marginRight: 6 }} />Policy Administration</div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
                Manage member access and security policies for the institution.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="field">
                  <label>Member Address</label>
                  <input
                    placeholder="0x..."
                    value={manageSubject}
                    onChange={e => setManageSubject(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Policy ID</label>
                  <input
                    placeholder="Silver / Gold / Exec"
                    value={managePolicyId}
                    onChange={e => setManagePolicyId(e.target.value)}
                  />
                </div>
              </div>
              <button
                className="btn btn-outline"
                style={{ width: '100%', marginTop: 16 }}
                onClick={handleBindUser}
              >
                Bind Member to Policy
              </button>
            </div>

            <div className="card">
              <div className="panel-title"><Snowflake size={16} aria-hidden="true" style={{ marginRight: 6 }} />Emergency Control</div>
              <button
                className="btn btn-outline"
                onClick={handleFreeze}
                disabled={isBusy || !vault.policyId}
                style={{ width: '100%', marginBottom: 10 }}
              >
                Freeze Policy
              </button>
              <button
                className="btn btn-primary"
                onClick={handleUnfreeze}
                disabled={isBusy || !vault.policyId}
                style={{ width: '100%' }}
              >
                Unfreeze Policy
              </button>
            </div>

            <div className="card span-2">
              <div className="panel-title"><Activity size={16} aria-hidden="true" style={{ marginRight: 6 }} />Protocol Health Diagnostics</div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
                Verify the integrity of the CPE-Gateway-Infrastructure trust chain.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div className={`health-item ${healthStatus.registry ? 'ok' : 'pending'}`}>
                  Registry Writer {healthStatus.registry === true ? '✓' : healthStatus.registry === false ? '✗' : '...'}
                </div>
                <div className={`health-item ${healthStatus.logger ? 'ok' : 'pending'}`}>
                  Audit Logger {healthStatus.logger === true ? '✓' : healthStatus.logger === false ? '✗' : '...'}
                </div>
                <div className={`health-item ${healthStatus.gateway ? 'ok' : 'pending'}`}>
                  Gateway Authorized {healthStatus.gateway === true ? '✓' : healthStatus.gateway === false ? '✗' : '...'}
                </div>
              </div>
              <button className="btn btn-sm btn-ghost" onClick={checkHealth} style={{ width: '100%' }}>
                Run Diagnostics
              </button>
            </div>
          </>
        )}

        {/* 7. TX History */}
        <div className="card span-2">
          <div className="panel-title"><History size={16} aria-hidden="true" style={{ marginRight: 6 }} />Transaction History</div>
          <TxBanner status={vault.txStatus} txHash={vault.txHash} error={vault.txError} />
          {vault.txHistory.length === 0 ? (
            <div className="tx-empty">No transactions yet.</div>
          ) : (
            <div className="tx-list">
              {vault.txHistory.map((tx, i) => (
                <div key={i} className="tx-item">
                  <span className="tx-item__type">{tx.type}</span>
                  <span className={`badge ${tx.status === 'approved' ? 'badge-ok' : tx.status === 'denied' ? 'badge-err' : 'badge-muted'}`}>
                    {tx.status}
                  </span>
                  <span className="tx-item__time">{new Date(tx.timestamp).toLocaleTimeString()}</span>
                  <a href={tx.etherscanUrl} target="_blank" rel="noreferrer" className="tx-item__link">Etherscan ↗</a>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div >
  );
}
