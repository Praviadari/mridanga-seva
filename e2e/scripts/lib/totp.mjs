// Six-digit sign-in codes (TOTP, RFC 6238: SHA-1, 30 s), the same codes an authenticator app shows
// for the set-up key the app gives on "My sign-in code". Node's crypto only.

import { createHmac } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Base32 (RFC 4648) to bytes; spaces, dashes and padding ignored, any case. */
export function base32Bytes(secret) {
  const clean = secret.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    const v = ALPHABET.indexOf(ch);
    if (v === -1) throw new Error('the set-up key is not base32');
    value = (value << 5) | v;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** The code for one moment (ms since 1970). */
export function totp(secret, now = Date.now(), step = 30, digits = 6) {
  const counter = Math.floor(now / 1000 / step);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', base32Bytes(secret)).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin = hmac.readUInt32BE(offset) & 0x7fffffff;
  return String(bin % 10 ** digits).padStart(digits, '0');
}

/**
 * A code that stays valid for a few more seconds: near the end of a 30 s window it waits for the
 * next one, so a code is never typed just as it expires.
 */
export async function freshTotp(secret) {
  const left = 30 - (Math.floor(Date.now() / 1000) % 30);
  if (left < 5) await new Promise((r) => setTimeout(r, left * 1000 + 250));
  return totp(secret);
}
