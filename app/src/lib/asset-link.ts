// The link printed as the QR code on an asset label (docs/DECISIONS.md #157): the web app's
// address + /i/ + the item's asset_token. A phone's camera app opens it in the browser; the app's
// own scanner reads it too (src/lib/scan-text.ts). The link shows nothing without a staff sign-in
// (migration 0035, resolve_asset).

import { Platform } from 'react-native';

/**
 * The LIVE web app's addresses (docs/DECISIONS.md #294, audit R2-08). The first is where the phone app
 * opens "Print QR cards" and what new labels carry; every one of them scans. Until the domain move
 * (GO_LIVE_CHECKLIST E3) the LIVE site is mridanga-seva.pages.dev and app.mridangaseva.com is not live.
 * THE DOMAIN MOVE = swap these two lines, so labels printed from either site keep scanning.
 */
export const LIVE_WEB_ORIGINS = [
  'https://mridanga-seva.pages.dev',
  'https://app.mridangaseva.com',
] as const;

/** The LIVE web app's address for real labels and printing: the first of LIVE_WEB_ORIGINS. */
export const ASSET_LINK_ORIGIN: string = LIVE_WEB_ORIGINS[0];

/** The TEST web site (Cloudflare Pages project mridanga-seva-test, docs/OPERATIONS.md). */
export const TEST_WEB_ORIGIN = 'https://mridanga-seva-test.pages.dev';

/** The TEST Supabase project's ref: a build against it prints and opens TEST links. */
const TEST_PROJECT_REF = 'fhuqykssenuhczdqbafu';

/** Characters of an asset_token: 22 of base64url. */
const TOKEN = /^[A-Za-z0-9_-]{22}$/;

/**
 * The web app this build belongs to: on the web, the site it runs on (the TEST site, a preview or
 * localhost print links back to themselves, so a test label scans into the same database); in the
 * phone app, the TEST site for a TEST build, else ASSET_LINK_ORIGIN.
 */
export function webAppOrigin(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') return window.location.origin;
  return (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').includes(TEST_PROJECT_REF) ? TEST_WEB_ORIGIN : ASSET_LINK_ORIGIN;
}

/** The link on an item's label, e.g. https://app.mridangaseva.com/i/Ab3...; origin defaults to webAppOrigin(). */
export function assetLink(token: string, origin: string = webAppOrigin()): string {
  return `${origin}/i/${token}`;
}

/**
 * The asset_token in scanned text, or null: a label link from any of our sites
 * (https://<host>/i/<token>, with or without a trailing slash), or a bare token.
 */
export function assetTokenFromScan(text: string): string | null {
  const trimmed = text.trim();
  if (TOKEN.test(trimmed)) return trimmed;
  const match = /^https?:\/\/([^/?#]+)\/i\/([A-Za-z0-9_-]{22})\/?(?:[?#].*)?$/i.exec(trimmed);
  if (!match) return null;
  const host = match[1].toLowerCase();
  const ours =
    LIVE_WEB_ORIGINS.some((origin) => host === new URL(origin).host) ||
    host === new URL(TEST_WEB_ORIGIN).host ||
    host.endsWith('.mridanga-seva-test.pages.dev') ||
    host.startsWith('localhost') ||
    (Platform.OS === 'web' && typeof window !== 'undefined' && host === window.location.host);
  return ours ? match[2] : null;
}
