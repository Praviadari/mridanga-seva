// Web Push for the notify-announcements Edge Function (migration 0062, docs/DECISIONS.md #601): the message
// encryption of RFC 8291 (content coding aes128gcm, RFC 8188) and the VAPID signature of RFC 8292, written on the
// Web Crypto API that Deno and Node both have, so no npm package runs in the function and
// supabase/tests/push-messages.test.mjs checks this very file against http_ece, the reference implementation of the
// RFCs' author.
//
// A browser that subscribed gave three things (saved by save_web_push): its push service address (the endpoint),
// its P-256 public key (p256dh) and a 16-byte secret (auth). Each message is encrypted for that browser alone with a
// new key pair and salt: the push service (Google, Apple, Mozilla, Microsoft) carries it but cannot read it. The
// VAPID header proves the message comes from the holder of the site's key pair, whose public half the browser was
// given when it subscribed (EXPO_PUBLIC_WEB_PUSH_KEY in the web build).

const encoder = new TextEncoder();

/** Bytes to base64url without padding. */
export function toBase64Url(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** base64url (padding optional) to bytes. Throws on other characters. */
export function fromBase64Url(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*=*$/.test(text)) throw new Error('not base64url');
  const plain = text.replace(/=+$/, '').replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(plain + '='.repeat((4 - (plain.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** The pieces joined into one array. */
function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** HKDF-SHA-256 of RFC 5869 (extract with `salt`, expand with `info`), `length` bytes. */
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

/** One browser's subscription, as saved by save_web_push. */
export type Subscription = { endpoint: string; p256dh: string; auth: string };

/** Record size written in the header: one record holds the whole message (at most 4096 bytes are allowed anyway). */
const RECORD_SIZE = 4096;

/**
 * The message body for one browser (RFC 8291 section 3.4): salt (16) | record size (4) | key id length (1) | the
 * sender's public key (65) | the encrypted text with its 16-byte tag. `fixed` gives the salt and key pair in tests.
 */
export async function encryptFor(
  subscription: Subscription,
  plaintext: Uint8Array,
  fixed?: { salt: Uint8Array; keys: CryptoKeyPair },
): Promise<Uint8Array> {
  const uaPublic = fromBase64Url(subscription.p256dh);
  const authSecret = fromBase64Url(subscription.auth);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error('bad p256dh');
  if (authSecret.length !== 16) throw new Error('bad auth');
  const keys = fixed?.keys ?? (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']));
  const salt = fixed?.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, keys.privateKey, 256));

  // IKM = HKDF(auth, ecdh, "WebPush: info" 0x00 ua_public as_public), then the content key and nonce of RFC 8188.
  const ikm = await hkdf(authSecret, ecdhSecret, concat(encoder.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, encoder.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode('Content-Encoding: nonce\0'), 12);

  // The text, then the delimiter 2 of the last (here the only) record, no padding.
  const record = concat(plaintext, new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, record));

  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE);
  header[20] = asPublic.length;
  return concat(header, asPublic, sealed);
}

/** The site's VAPID key pair: the private key ready to sign, the public key as the browser was given it. */
export type Vapid = { privateKey: CryptoKey; publicKey: string; subject: string };

/**
 * Reads the key pair from the function's secrets: WEB_PUSH_PUBLIC_KEY (65 bytes, base64url, the same value as the web
 * build's EXPO_PUBLIC_WEB_PUSH_KEY) and WEB_PUSH_PRIVATE_KEY (the 32-byte private number d, base64url), as
 * app/scripts/web-push-keys.mjs prints them. `subject` is a mailto: or https: contact for the push services.
 */
export async function vapidFrom(publicKey: string, privateKey: string, subject: string): Promise<Vapid> {
  const point = fromBase64Url(publicKey);
  const d = fromBase64Url(privateKey);
  if (point.length !== 65 || point[0] !== 4) throw new Error('WEB_PUSH_PUBLIC_KEY is not a P-256 public key');
  if (d.length !== 32) throw new Error('WEB_PUSH_PRIVATE_KEY is not a P-256 private key');
  if (!/^(mailto:|https:\/\/)\S+$/.test(subject)) throw new Error('WEB_PUSH_SUBJECT must start with mailto: or https://');
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: toBase64Url(point.slice(1, 33)),
    y: toBase64Url(point.slice(33, 65)),
    d: toBase64Url(d),
    ext: false,
  };
  // Importing checks that d belongs to the public point's curve; a pair that does not match fails at the push
  // service (401/403), which the run counts as vapid_refused.
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  return { privateKey: key, publicKey: toBase64Url(point), subject };
}

/** Twelve hours: the longest a push service must accept is 24 hours (RFC 8292 section 2). */
const TOKEN_LIFETIME_S = 12 * 60 * 60;

/**
 * The Authorization header for a push service (RFC 8292): "vapid t=<JWT ES256 for the service's origin>, k=<public key>".
 * `nowSeconds` is for tests.
 */
export async function vapidHeader(vapid: Vapid, endpoint: string, nowSeconds = Math.floor(Date.now() / 1000)): Promise<string> {
  const audience = new URL(endpoint).origin;
  const part = (value: unknown) => toBase64Url(encoder.encode(JSON.stringify(value)));
  const unsigned = `${part({ typ: 'JWT', alg: 'ES256' })}.${part({ aud: audience, exp: nowSeconds + TOKEN_LIFETIME_S, sub: vapid.subject })}`;
  // Web Crypto signs ECDSA as r | s (64 bytes), which is what JWS ES256 wants.
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, vapid.privateKey, encoder.encode(unsigned)),
  );
  return `vapid t=${unsigned}.${toBase64Url(signature)}, k=${vapid.publicKey}`;
}
