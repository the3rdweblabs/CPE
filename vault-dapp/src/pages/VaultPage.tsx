// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)
import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { SEPOLIA_CHAIN_ID } from '../contracts/addresses';
import VaultDashboard from './VaultDashboard';
import { AlertTriangle, Zap } from 'lucide-react';

const STEPS = [
  { num: '01', title: 'Connect Wallet', desc: 'Sign in with MetaMask or any injected wallet via RainbowKit.' },
  { num: '02', title: 'Deposit ETH', desc: 'Send ETH into the ConfidentialVault contract on Sepolia.' },
  { num: '03', title: 'Withdraw (FHE)', desc: 'Amount is FHE-encrypted client-side before the tx is sent. Policy evaluates in ciphertext.', hasIcon: true },
  { num: '04', title: 'Policy Admin', desc: 'If you are the policy admin you can freeze/unfreeze the policy.' },
];

export default function VaultPage() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const isWrongNetwork = isConnected && chainId !== SEPOLIA_CHAIN_ID;

  /* Not connected: show vault landing */
  if (!isConnected) {
    return (
      <div className="vault-landing fade-up">
        <div className="hero__eyebrow">Live on Sepolia Testnet</div>

        <h1 className="hero__title" style={{ fontSize: 'clamp(32px,5vw,60px)' }}>
          ConfidentialVault<br />
          <span>Demo</span>
        </h1>

        <p className="hero__sub">
          A fully deployed ETH vault gated by the CPE. Deposits are free;
          withdrawals are checked against your encrypted policy - all in ciphertext,
          all on-chain.
        </p>

        {/* How it works */}
        <div className="vault-landing__steps">
          {STEPS.map(s => (
            <div key={s.num} className="vault-landing__step">
              <div className="step-num">Step {s.num}</div>
              <div className="step-title">
                {s.hasIcon && <Zap size={14} aria-hidden="true" style={{ marginRight: 4, color: 'var(--accent)' }} />}
                {s.title}
              </div>
              <div className="step-desc">{s.desc}</div>
            </div>
          ))}
        </div>

        {/* Connect CTA */}
        <ConnectButton label="Connect Wallet to Start" />
      </div>
    );
  }

  /* Wrong network */
  if (isWrongNetwork) {
    return (
      <div style={{ padding: '60px 24px', maxWidth: 480, margin: '0 auto', textAlign: 'center' }}>
        <div className="network-warn" style={{ justifyContent: 'center', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={18} aria-hidden="true" />
          Please switch to Sepolia testnet
        </div>
        <button
          className="btn btn-primary"
          onClick={() => switchChain({ chainId: SEPOLIA_CHAIN_ID })}
        >
          Switch to Sepolia
        </button>
      </div>
    );
  }

  /* Connected on Sepolia: show dashboard */
  return <VaultDashboard />;
}
