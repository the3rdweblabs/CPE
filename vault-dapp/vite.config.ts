// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * WalletConnect / QR rendering hotfix
 *
 * In production the app sometimes crashes when opening WalletConnect QR modal with:
 *   Error: invalid border=0
 *
 * This is thrown from a QR code generator deep in the WalletConnect/RainbowKit
 * dependency chain when it receives a border/quiet-zone of 0.
 *
 * We defensively patch the bundled dependency during build to rewrite `border: 0`
 * (or `border=0`) to `border: 1`.
 */
function patchWalletConnectQrBorder() {
  return {
    name: 'patch-walletconnect-qr-border',
    enforce: 'pre',
    apply: 'build',
    transform(code: string, id: string) {
      // Only patch dependencies (never our source).
      if (!id.includes('/node_modules/')) return null

      // Only patch likely candidates to avoid unintended rewrites.
      const looksLikeQr =
        id.includes('/node_modules/qrcode/') ||
        id.includes('/node_modules/qrcode-generator/') ||
        id.includes('/node_modules/@walletconnect/')

      if (!looksLikeQr) return null

      let out = code
      out = out.replace(/\bborder\s*:\s*0\b/g, 'border: 1')
      out = out.replace(/\bborder\s*=\s*0\b/g, 'border=1')

      if (out === code) return null
      return { code: out, map: null }
    },
  }
}

export default defineConfig({
  plugins: [react(), patchWalletConnectQrBorder()],
  build: {
    target: 'esnext', // required for top-level await (WASM loading)
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext',
    },
  },
})
