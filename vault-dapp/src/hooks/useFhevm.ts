// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)
/**
 * useFhevm - singleton FHEVM instance for the dApp.
 */
import { useState, useEffect, useRef } from 'react';

// Singleton state
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _instance: any = null;
let _initPromise: Promise<void> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FhevmInstance = any;

export function useFhevm() {
  const [instance, setInstance] = useState<FhevmInstance | null>(_instance);
  const [loading, setLoading] = useState(!_instance);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    if (_instance) {
      Promise.resolve().then(() => {
        setInstance(_instance);
        setLoading(false);
      });
      return;
    }

    if (!_initPromise) {
      _initPromise = (async () => {
        try {
          // Use literal string for Vite static analysis
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const mod = await import('@zama-fhe/relayer-sdk/web') as any;
          const { initSDK, createInstance, SepoliaConfig } = mod.default || mod;

          if (typeof initSDK === 'function') {
            console.log('[useFhevm] Initializing FHE SDK (loading WASM)...');
            await initSDK();
          } else {
            console.warn('[useFhevm] initSDK not found on module export');
          }

          if (typeof createInstance !== 'function') {
            throw new Error('[useFhevm] createInstance not found');
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const eth = (window as any).ethereum;
          if (!eth) {
            throw new Error('No Ethereum wallet detected. Please connect MetaMask or another wallet.');
          }

          console.log('[useFhevm] Creating FHEVM instance...');
          _instance = await createInstance({
            ...SepoliaConfig,
            network: eth,
          });
          console.log('[useFhevm] FHEVM instance successfully created!');
        } catch (err) {
          console.error('[useFhevm] init failed:', err);
          _initPromise = null;
          if (mounted.current) setError(String(err));
        }
      })();
    }

    _initPromise!.then(() => {
      if (mounted.current) {
        setInstance(_instance);
        setLoading(false);
      }
    });

    return () => { mounted.current = false; };
  }, []);

  return { instance, loading, error };
}
