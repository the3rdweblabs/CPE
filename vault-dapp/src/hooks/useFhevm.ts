/**
 * useFhevm - singleton FHEVM instance for the dApp.
 *
 * initSDK() loads the WASM binary once; createInstance() wires it to
 * window.ethereum (MetaMask / RainbowKit wallet) for input-proof generation.
 *
 * Import pattern: '@zama-fhe/relayer-sdk/bundle' is the browser-optimised
 * build recommended by Zama for Vite/React apps.
 */
import { useState, useEffect, useRef } from 'react';

// Singleton state
let _instance: unknown = null;
let _initPromise: Promise<void> | null = null;

// The SDK instance shape is provided by the relayer SDK; use `any`
// here to allow the dapp to call documented instance methods without
// overly strict local typings. If you prefer, replace `any` with a
// precise interface matching `createInstance()`'s return value.
export type FhevmInstance = any;

export function useFhevm() {
  const [instance, setInstance] = useState<FhevmInstance | null>(_instance);
  const [loading,  setLoading]  = useState(!_instance);
  const [error,    setError]    = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    if (_instance) {
      setInstance(_instance);
      setLoading(false);
      return;
    }

    if (!_initPromise) {
      _initPromise = (async () => {
        try {
          // Try several possible package entry points to accommodate different bundling setups
          // Only attempt documented explicit entry-points - the package does not
          // export the package root (no "." export), so importing '@zama-fhe/relayer-sdk'
          // can fail in environments that honor the `exports` field. Prefer
          // `/bundle` or `/web` which are provided by the package.
          const candidates = [
            '@zama-fhe/relayer-sdk/bundle',
            '@zama-fhe/relayer-sdk/web',
          ];
          let mod: any = null;
          let lastErr: unknown = null;

          // If the SDK bundle was injected (index.html), it exposes a global
          // `window.relayerSDK`. Prefer that to avoid the browser attempting
          // to resolve package specifiers like '@zama-fhe/relayer-sdk/web'.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if ((window as any).relayerSDK) {
            mod = (window as any).relayerSDK;
          } else {
            for (const spec of candidates) {
              try {
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                // dynamic import - some environments resolve different entry points
                // @ts-ignore
                // Tell Vite to ignore static analysis for this dynamic specifier
                // so it doesn't warn about dynamic import variables.
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore:next-line
                // @vite-ignore
                mod = await import(spec);
                lastErr = null;
                break;
              } catch (err) {
                lastErr = err;
              }
            }
            if (!mod) throw lastErr || new Error('could not import relayer-sdk');
          }

          const createInstance = mod.createInstance ?? mod.default?.createInstance;
          const SepoliaConfig = mod.SepoliaConfig ?? mod.default?.SepoliaConfig ?? {};

          if (typeof createInstance !== 'function') {
            const keys = Object.keys(mod ?? {});
            throw new Error(`[useFhevm] relayer-sdk missing createInstance export. exports: ${JSON.stringify(keys)}`);
          }

          // createInstance is the documented initialization method
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          _instance = await createInstance({
            ...SepoliaConfig,
            network: (window as any).ethereum, // EIP-1193 - MetaMask / injected wallet
          });
        } catch (err) {
          console.error('[useFhevm] init failed:', err);
          _initPromise = null; // allow retry
          if (mounted.current) setError(String(err));
        }
      })();
    }

    _initPromise.then(() => {
      if (mounted.current) {
        setInstance(_instance);
        setLoading(false);
      }
    });

    return () => { mounted.current = false; };
  }, []);

  return { instance, loading, error };
}
