import { base64ToBuffer } from './serialize.js';

/** @returns {{ ok: true, buffer: Buffer } | { ok: false, error: string }} */
export function requireRowVersion(b64) {
  const buf = base64ToBuffer(b64);
  if (!buf || buf.length !== 8) {
    return { ok: false, error: 'Invalid rowVersion' };
  }
  return { ok: true, buffer: buf };
}