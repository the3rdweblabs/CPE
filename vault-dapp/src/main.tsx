/* eslint-disable react-refresh/only-export-components */
// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)
import './polyfills';
import '@rainbow-me/rainbowkit/styles.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { RainbowKitProvider, lightTheme, createAuthenticationAdapter, RainbowKitAuthenticationProvider } from '@rainbow-me/rainbowkit';
import { createSiweMessage } from 'viem/siwe';
import { useState, useMemo, useEffect } from 'react';
import { WagmiProvider, useAccount } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { wagmiConfig } from './wagmi';
import App from './App';
import './index.css';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 50, color: 'white', textAlign: 'center', background: '#000', height: '100vh' }}>
          <h1>Something went wrong.</h1>
          <pre style={{ textAlign: 'left', background: '#333', padding: 20, overflow: 'auto', fontSize: 11, color: '#f8f8f8' }}>
            {this.state.error?.stack || this.state.error?.toString()}
          </pre>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>Reload Page</button>
        </div>
      );
    }
    return this.props.children;
  }
}

function generateNonce() {
  return Math.random().toString(36).substring(2);
}

function AppWithAuth() {
  const { address } = useAccount();
  const [authStatus, setAuthStatus] = useState<'loading' | 'unauthenticated' | 'authenticated'>('loading');

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('auth_state');
      if (address && saved && saved.toLowerCase() === address.toLowerCase()) {
        Promise.resolve().then(() => {
          setAuthStatus('authenticated');
        });
      } else {
        Promise.resolve().then(() => {
          setAuthStatus('unauthenticated');
          window.localStorage.removeItem('auth_state');
          window.dispatchEvent(new Event('auth_change'));
        });
      }
    } catch {
      Promise.resolve().then(() => {
        setAuthStatus('unauthenticated');
      });
    }
  }, [address]);

  const authenticationAdapter = useMemo(() => createAuthenticationAdapter({
    getNonce: async () => {
      return generateNonce();
    },
    createMessage: ({ nonce, address, chainId }) => {
      return createSiweMessage({
        domain: window.location.host,
        address,
        statement: 'Sign in with Ethereum to access the Confidential Policy Engine.',
        uri: window.location.origin,
        version: '1',
        chainId,
        nonce,
      });
    },
    verify: async ({ signature }) => {
      console.log('SIWE Signature Verified:', signature);
      setAuthStatus('authenticated');
      try {
        if (address) {
          window.localStorage.setItem('auth_state', address.toLowerCase());
        } else {
          window.localStorage.setItem('auth_state', 'authenticated');
        }
        window.dispatchEvent(new Event('auth_change'));
      } catch { /* ignore */ }
      return true;
    },
    signOut: async () => {
      setAuthStatus('unauthenticated');
      try {
        window.localStorage.removeItem('auth_state');
        window.dispatchEvent(new Event('auth_change'));
      } catch { /* ignore */ }
    },
  }), [address]);

  return (
    <RainbowKitAuthenticationProvider adapter={authenticationAdapter} status={authStatus}>
      <RainbowKitProvider theme={lightTheme()}>
        <App />
      </RainbowKitProvider>
    </RainbowKitAuthenticationProvider>
  );
}

const queryClient = new QueryClient();

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <ErrorBoundary>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <AppWithAuth />
        </QueryClientProvider>
      </WagmiProvider>
    </ErrorBoundary>,
  );
}
