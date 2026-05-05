// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)
import { Buffer } from 'buffer';

declare global {
  interface Window {
    Buffer: typeof Buffer;
    global: Window & typeof globalThis;
  }
}

if (typeof window !== 'undefined') {
  window.Buffer = Buffer;
  window.global = window as Window & typeof globalThis;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).process = {
    env: {
      NODE_ENV: import.meta.env.MODE || 'development'
    },
    version: '',
    nextTick: (cb: (...args: unknown[]) => void) => {
      setTimeout(cb, 0);
    }
  };
}
