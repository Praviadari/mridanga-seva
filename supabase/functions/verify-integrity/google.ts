// Google's side of the integrity check: a service account signs in (OAuth 2.0 JWT bearer, RS256 by
// WebCrypto) and asks Play Integrity to decode the phone's token. Tokens of a link-installed app are
// decoded only on Google's servers (self-managed keys need a Play listing). Kept apart from Deno so
// plain Node can test it with a made-up key and an imitated Google (integrity-verdict.test.mjs).
//
// The service account's JSON key lives only in the function's secret GOOGLE_SERVICE_ACCOUNT_JSON
// (docs/OPERATIONS.md "Face scan: integrity check") — never in git, never in the app.

import type { IntegrityPayload } from './verdict.ts';

export const TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const SCOPE = 'https://www.googleapis.com/auth/playintegrity';
export const decodeUrl = (packageName: string) => `https://playintegrity.googleapis.com/v1/${packageName}:decodeIntegrityToken`;

export interface ServiceAccount { client_email: string; private_key: string }

/** The two fields we need from the JSON key, or null when the secret is missing or wrong. */
export function parseServiceAccount(json: string | undefined): ServiceAccount | null {
  if (!json) return null;
  try {
    const sa = JSON.parse(json) as Record<string, unknown>;
    if (typeof sa.client_email !== 'string' || typeof sa.private_key !== 'string'
        || !sa.private_key.includes('BEGIN PRIVATE KEY')) return null;
    return { client_email: sa.client_email, private_key: sa.private_key };
  } catch {
    return null;
  }
}

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlText = (text: string) => b64url(new TextEncoder().encode(text));

/** The signed JWT the service account exchanges for an access token (valid 1 hour). */
export async function signedAssertion(sa: ServiceAccount, nowSec: number): Promise<string> {
  const der = Uint8Array.from(atob(sa.private_key.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '')), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const head = b64urlText(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64urlText(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat: nowSec, exp: nowSec + 3600 }));
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(new Uint8Array(signature))}`;
}

/** Why Google could not decode a token (the result code the database counts is decode_failed). */
export class DecodeError extends Error {}

/**
 * A decoder for one package: (token) => Google's tokenPayloadExternal. Keeps the access token until
 * a minute before it expires (one function instance serves many check-ins).
 */
export function googleDecoder(fetcher: typeof fetch, sa: ServiceAccount, packageName: string, nowMs: () => number = Date.now) {
  let cached: { token: string; until: number } | null = null;

  async function accessToken(): Promise<string> {
    if (cached && cached.until > nowMs()) return cached.token;
    const assertion = await signedAssertion(sa, Math.floor(nowMs() / 1000));
    const response = await fetcher(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
    });
    const data = await response.json().catch(() => ({})) as { access_token?: string; expires_in?: number };
    if (!response.ok || typeof data.access_token !== 'string') throw new DecodeError(`token ${response.status}`);
    cached = { token: data.access_token, until: nowMs() + Math.max(0, (data.expires_in ?? 3600) - 60) * 1000 };
    return data.access_token;
  }

  return async (integrityToken: string): Promise<IntegrityPayload> => {
    const response = await fetcher(decodeUrl(packageName), {
      method: 'POST',
      headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ integrity_token: integrityToken }),
    });
    if (response.status === 401) cached = null;
    const data = await response.json().catch(() => ({})) as { tokenPayloadExternal?: IntegrityPayload };
    if (!response.ok || !data.tokenPayloadExternal) throw new DecodeError(`decode ${response.status}`);
    return data.tokenPayloadExternal;
  };
}
