import * as originalQR from '../node_modules/qr/index.js';

const originalBorder = originalQR._tests.Bitmap.prototype.border;
let globalBorderless = false;

originalQR._tests.Bitmap.prototype.border = function(border, value) {
  if (globalBorderless && border === 1) {
    return this;
  }
  return originalBorder.call(this, border, value);
};

export * from '../node_modules/qr/index.js';

export function encodeQR(text, output, opts) {
  const safeOpts = { ...opts };
  if (safeOpts.border === 0) {
    safeOpts.border = 1;
    globalBorderless = true;
  }
  try {
    return originalQR.encodeQR(text, output, safeOpts);
  } finally {
    globalBorderless = false;
  }
}

export default encodeQR;
