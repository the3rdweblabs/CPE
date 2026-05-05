// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@zama-fhe/relayer-sdk/web': resolve(__dirname, 'node_modules/@zama-fhe/relayer-sdk/lib/web.js'),
      '@zama-fhe/relayer-sdk/bundle': resolve(__dirname, 'node_modules/@zama-fhe/relayer-sdk/bundle.js'),
    },
  },
  plugins: [react()],
  build: {
    target: 'esnext', // required for top-level await (WASM loading)
  },
  optimizeDeps: {
    exclude: ['@zama-fhe/relayer-sdk'], // don't pre-bundle; contains WASM
    esbuildOptions: {
      target: 'esnext',
    },
  },
})
