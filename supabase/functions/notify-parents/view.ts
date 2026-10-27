// The parent page's link (migration 0063, docs/DECISIONS.md #640-#649): the weekly email carries
// <web app>/parent#v=<guardian id>.<expiry>.<signature>, good for 14 days. The signature is an HMAC of
// "parent-view:<guardian>:<expiry>" with the push secret, so only a link from one of our emails opens a page, only
// for the child of that guardian row, and only until it expires; the database checks the rest at every opening
// (parent_view: the parent's yes, the data consent, an active minor, the Guru's switch). The token sits after '#',
// so it never reaches a server in an address or a Referer: the page sends it to notify-parents in a POST body.
// Kept apart from Deno so plain Node can test it (supabase/tests/parent-notices.test.mjs).

/** How long a link opens the page: two weekly emails, so last week's link still works when this week's comes. */
export const VIEW_LINK_DAYS = 14;

const PURPOSE = 'parent-view';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Base64url without padding. */
function base64url(bytes: Uint8Array): string {
  let text = '';
  for (const b of bytes) text += String.fromCharCode(b);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The signature of a page link: HMAC-SHA256 of "parent-view:<guardian>:<expiry>". */
export async function viewSignature(secret: string, guardianId: string, expires: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${PURPOSE}:${guardianId}:${expires}`));
  return base64url(new Uint8Array(mac));
}

/** The token of a link made at `now` (ms): '<guardian>.<expiry in Unix seconds>.<signature>'. */
export async function viewToken(secret: string, guardianId: string, now: number = Date.now()): Promise<string> {
  const expires = Math.floor(now / 1000) + VIEW_LINK_DAYS * 24 * 60 * 60;
  return `${guardianId}.${expires}.${await viewSignature(secret, guardianId, expires)}`;
}

/**
 * The page's address for a guardian: the web app (consentPageUrl's choice, without its path) + /parent, the
 * email's language as ?lang= (not for English), the token after '#'.
 */
export async function viewUrl(webApp: string, secret: string, guardianId: string, language: string, now: number = Date.now()): Promise<string> {
  const lang = language === 'te' || language === 'hi' ? `?lang=${language}` : '';
  return `${webApp.replace(/\/$/, '')}/parent${lang}#v=${await viewToken(secret, guardianId, now)}`;
}

/**
 * What a token says: the guardian id of a correctly signed, unexpired token; 'expired' for a correctly signed one
 * past its time; null for anything else. Compared in constant time.
 */
export async function checkView(secret: string, token: unknown, now: number = Date.now()): Promise<string | 'expired' | null> {
  if (typeof token !== 'string' || token.length > 200) return null;
  const [id, expiresText, signature, extra] = token.split('.');
  if (extra !== undefined || !id || !UUID.test(id) || !/^\d{9,11}$/.test(expiresText ?? '') || !signature) return null;
  const guardianId = id.toLowerCase();
  const expires = Number(expiresText);
  const expected = await viewSignature(secret, guardianId, expires);
  let difference = expected.length ^ signature.length;
  for (let i = 0; i < Math.max(expected.length, signature.length); i++) {
    difference |= (expected.charCodeAt(i) || 0) ^ (signature.charCodeAt(i) || 0);
  }
  if (difference !== 0) return null;
  return expires * 1000 <= now ? 'expired' : guardianId;
}
