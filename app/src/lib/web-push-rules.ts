// The rules of web push in the browser (migration 0062, docs/DECISIONS.md #603-#606), kept apart from
// lib/web-push.web.ts, which touches the browser, so tests/web-push.test.mjs checks them with plain Node.
//
// - Where it can work (webPushPlace): a browser with service workers, the Push API and notifications, on https, in an
//   exported build that has this site's public key. An iPhone or iPad only in the home-screen app (iOS 16.4 and
//   later): in Safari the app explains Add to Home Screen instead of offering it (#603).
// - Whose it is (startAction): a browser's subscription belongs to the login that switched it on here, noted on the
//   device; another login that signs in on that browser never inherits it, it is ended (#604).

/** What My profile shows for this browser. */
export type WebPushPlace = 'ready' | 'iphone-add-to-home' | 'iphone-too-old' | 'unsupported' | 'not-set-up';

/** What the browser says about itself (lib/web-push.web.ts reads it). */
export type BrowserFacts = {
  userAgent: string;
  /** navigator.maxTouchPoints: an iPad asking for the desktop site says "Macintosh" but has touch points. */
  maxTouchPoints: number;
  /** Opened from the home screen (display-mode standalone, or Safari's navigator.standalone). */
  standalone: boolean;
  serviceWorker: boolean;
  pushManager: boolean;
  notification: boolean;
  /** window.isSecureContext: https or localhost. */
  secure: boolean;
  /** An exported build (NODE_ENV production): the service worker exists only there (lib/offline-shell.web.ts). */
  built: boolean;
  /** This site's public VAPID key (EXPO_PUBLIC_WEB_PUSH_KEY), if the build has one. */
  key: string | undefined;
};

/** True for a P-256 public key as base64url: 65 bytes, the first one 4, are 87 characters starting with B. */
export function validPublicKey(key: string | undefined): key is string {
  return typeof key === 'string' && /^B[A-Za-z0-9_-]{86}$/.test(key);
}

/** An iPhone, iPod or iPad, also an iPad that asks for the desktop site. */
export function isApple(userAgent: string, maxTouchPoints: number): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

/** The iOS version in the browser's name ("CPU iPhone OS 16_3 like Mac OS X"), or null when it does not say. */
export function iosVersion(userAgent: string): [number, number] | null {
  const found = /OS (\d+)[_.](\d+)/.exec(userAgent);
  return /iPhone|iPad|iPod/.test(userAgent) && found ? [Number(found[1]), Number(found[2])] : null;
}

/** Where web push stands in this browser. */
export function webPushPlace(facts: BrowserFacts): WebPushPlace {
  if (!facts.built || !validPublicKey(facts.key)) return 'not-set-up';
  if (isApple(facts.userAgent, facts.maxTouchPoints)) {
    const version = iosVersion(facts.userAgent);
    if (version && (version[0] < 16 || (version[0] === 16 && version[1] < 4))) return 'iphone-too-old';
    if (!facts.standalone) return 'iphone-add-to-home';
  }
  if (!facts.secure || !facts.serviceWorker || !facts.pushManager || !facts.notification) return 'unsupported';
  return 'ready';
}

/** base64url (padding optional) to bytes: the public key as pushManager.subscribe wants it. */
export function keyBytes(key: string): Uint8Array<ArrayBuffer> {
  const plain = key.replace(/=+$/, '').replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(plain + '='.repeat((4 - (plain.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Bytes (a subscription's key) to base64url without padding, as save_web_push takes them. */
export function base64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return '';
  let text = '';
  for (const byte of new Uint8Array(buffer)) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** True when a subscription was made with this site's key `key` (its options.applicationServerKey). */
export function madeWithKey(serverKey: ArrayBuffer | null | undefined, key: string): boolean {
  return !!serverKey && base64Url(serverKey) === base64Url(keyBytes(key).buffer);
}

/** The device's note of whose this browser's subscription is: the login, its address, when it was last saved. */
export type SavedSubscription = { user: string; endpoint: string; at: number };

/** The note as kept in localStorage, or null for anything else. */
export function parseSaved(text: string | null): SavedSubscription | null {
  try {
    const value = JSON.parse(text ?? 'null') as Partial<SavedSubscription> | null;
    return value && typeof value.user === 'string' && typeof value.endpoint === 'string' && typeof value.at === 'number'
      ? { user: value.user, endpoint: value.endpoint, at: value.at }
      : null;
  } catch {
    return null;
  }
}

/** Saved again at most once a week (as the phone's token, push-registered.ts), so the 90-day retention keeps it. */
export const SAVE_AGAIN_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * What a signed-in start does with this browser's subscription:
 * - 'none'        nothing to do (none here, or saved this week for this login);
 * - 'save'        this login's and still allowed: saved again (refreshes the 90 days);
 * - 'end'         not noted as this login's (another login switched it on here, or the note is gone): unsubscribed,
 *                 never handed over (#604);
 * - 'remove'      this login's, but the browser's permission was taken back: removed on the server and unsubscribed;
 * - 'forget'      noted as this login's but gone from the browser (site data cleared, home-screen app removed and
 *                 added again): its server row is removed;
 * - 'drop-note'   noted for another login and gone: only the note is dropped.
 */
export function startAction(
  saved: SavedSubscription | null,
  user: string,
  endpoint: string | null,
  permission: string,
  now = Date.now(),
): 'none' | 'save' | 'end' | 'remove' | 'forget' | 'drop-note' {
  if (endpoint) {
    if (!saved || saved.user !== user || saved.endpoint !== endpoint) return 'end';
    if (permission !== 'granted') return 'remove';
    return now < saved.at || now - saved.at >= SAVE_AGAIN_MS ? 'save' : 'none';
  }
  if (!saved) return 'none';
  return saved.user === user ? 'forget' : 'drop-note';
}

/** The screen a tap may open: an app path (one leading '/', letters, digits, '-', '_', '/'), else the start page. */
export function openablePath(url: unknown): string {
  return typeof url === 'string' && /^\/(?!\/)[A-Za-z0-9/_-]*$/.test(url) ? url : '/';
}
