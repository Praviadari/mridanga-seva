// The link printed as the QR code on an asset label (docs/DECISIONS.md #157): the web app's
// address + /i/ + the item's asset_token. A phone's camera app opens it in the browser; the app's
// own scanner reads it too (src/lib/scan-text.ts). The link shows nothing without a staff sign-in
// (migration 0035, resolve_asset).

import { Platform } from 'react-native';

/**
 * The web app's address for real labels. app.mridangaseva.com goes live with the LIVE site
 * (brief 8); until then labels printed for testing point to the TEST site (see webAppOrigin).
 */
export const ASSET_LINK_ORIGIN = 'https://app.mridangaseva.com';

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
    host === new URL(ASSET_LINK_ORIGIN).host ||
    host === new URL(TEST_WEB_ORIGIN).host ||
    host.endsWith('.mridanga-seva-test.pages.dev') ||
    host.startsWith('localhost') ||
    (Platform.OS === 'web' && typeof window !== 'undefined' && host === window.location.host);
  return ours ? match[2] : null;
}
