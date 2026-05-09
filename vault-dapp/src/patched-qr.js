import * as originalQR from '../node_modules/qr/index.js';

export * from '../node_modules/qr/index.js';

export function encodeQR(text, output, opts) {
  const safeOpts = { ...opts };
  const requestedBorder = safeOpts.border;

  if (requestedBorder === 0) {
    // Call original with border = 1 to prevent the library from throwing "invalid border=0"
    safeOpts.border = 1;
    const rawResult = originalQR.encodeQR(text, output, safeOpts);
    if (output === 'raw' && Array.isArray(rawResult)) {
      // Strip off the 1-pixel border to return the exact 0-border matrix expected by cuer / RainbowKit
      return rawResult.slice(1, -1).map(row => row.slice(1, -1));
    }
    return rawResult;
  }

  // Fallback for default undefined border to use standard scannable 2-module border
  if (safeOpts.border === undefined) {
    safeOpts.border = 2;
  }

  return originalQR.encodeQR(text, output, safeOpts);
}

export default encodeQR;
