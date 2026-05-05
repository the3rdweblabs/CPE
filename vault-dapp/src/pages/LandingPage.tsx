// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)
import { Link } from 'react-router-dom';

const FEATURES = [
  {
    icon: '🔐',
    title: 'Rules stored as ciphertext',
    desc:  'perTxLimit, dailyLimit, monthlyLimit, riskTier - all encrypted as euint64/euint8 on-chain. No observer can read the policy.',
  },
  {
    icon: '🔗',
    title: 'Address-bound enforcement',
    desc:  'Same wallet on MetaMask, Trust Wallet, or a raw CLI call hits the exact same encrypted policy. Session-agnostic.',
  },
  {
    icon: '🧊',
    title: 'Silent freeze',
    desc:  'A policy freeze is stored as an encrypted boolean. On-chain it is indistinguishable from any other state write.',
  },
  {
    icon: '🧩',
    title: 'One-line integration',
    desc:  'Downstream contracts call gateway.evaluateTransaction() and gate with FHE.req(approved). Drop-in for any protocol.',
  },
  {
    icon: '📋',
    title: 'Encrypted audit trail',
    desc:  'AuditLogger stores evaluation results as FHE handles. Only authorised auditors can request KMS decryption.',
  },
  {
    icon: '⚖️',
    title: 'Compliance gating',
    desc:  'evaluateCompliance() checks the user\'s encrypted KYC tier against a plaintext requirement - no tier revealed on-chain.',
  },
];

export default function LandingPage() {
  return (
    <>
      {/* Hero */}
      <section className="hero fade-up">
        <div className="hero__eyebrow">
          🔒 Powered by Zama FHEVM
        </div>

        <h1 className="hero__title">
          Confidential<br />
          <span>Policy Engine</span>
        </h1>

        <p className="hero__sub">
          Encrypted on-chain security policies for every transaction.
          Rules stored as FHE ciphertext - enforced on-chain, never visible.
        </p>

        <div className="hero__ctas">
          <a
            href="https://github.com/the3rdweblabs/CPE"
            target="_blank"
            rel="noreferrer"
            className="btn btn-outline btn-lg"
          >
            View CPE on GitHub ↗
          </a>
          <Link to="/vault" className="btn btn-primary btn-lg">
            Enter Vault Demo →
          </Link>
        </div>
      </section>

      {/* Feature grid */}
      <section className="features">
        <div className="features__grid">
          {FEATURES.map(f => (
            <div key={f.title} className="card fade-up">
              <div className="feature-card__icon">{f.icon}</div>
              <div className="feature-card__title">{f.title}</div>
              <p className="feature-card__desc">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
