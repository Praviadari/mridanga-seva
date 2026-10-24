// Web push in the web version (migration 0062, docs/DECISIONS.md #596-#609; audit 22-10-2026 fix 13): a signed-in
// student or staff member switches notifications on for this browser in My profile (components/web-push-section.tsx),
// only by a tap, never at load. The service worker that keeps the app offline (/sw.js, scripts/service-worker.js,
// registered after sign-in by lib/offline-shell.web.ts) subscribes with this site's public key
// (EXPO_PUBLIC_WEB_PUSH_KEY, written into the build by scripts/export-web.mjs), the address and keys are saved with
// save_web_push, and notify-announcements sends the announcements and notices the Android app gets. An iPhone gets
// them in the home-screen app only (iOS 16.4 and later).
//
// The subscription belongs to the login that switched it on here (noted on the device, WEB_PUSH_KEY); a start with
// another login ends it (lib/web-push-rules.ts startAction, #604). At sign-out the row is removed while the login still
// works (lib/push.web.ts unregisterPush), and the worker is then unregistered with everything it kept
// (lib/device-traces.ts), which ends the browser's subscription too. The rules are in ./web-push-rules.ts.

import { readLocal, removeLocal, writeLocal } from './local-storage';
import { storedLoginUserId, supabase } from './supabase';
import {
  base64Url,
  keyBytes,
  madeWithKey,
  parseSaved,
  startAction,
  type WebPushPlace,
  webPushPlace,
} from './web-push-rules';

// The phone version (./web-push.ts) adds 'native', which the web never answers.
export type { WebPushPlace } from './web-push-rules';

/** This site's public VAPID key, from the build's settings file (absent = web push is not set up on this site). */
const PUBLIC_KEY = process.env.EXPO_PUBLIC_WEB_PUSH_KEY;
/** Device storage key: whose this browser's subscription is ({user, endpoint, at}). */
const WEB_PUSH_KEY = 'webPushSaved';
/** How long to wait for the service worker before giving up on a tap. */
const WORKER_WAIT_MS = 10000;

/** Where web push stands in this browser. */
export function webPushHere(): WebPushPlace {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'unsupported';
  const nav = navigator as Navigator & { standalone?: boolean };
  let standalone = nav.standalone === true;
  try {
    standalone ||= window.matchMedia('(display-mode: standalone)').matches;
  } catch {
    // No matchMedia: not standalone.
  }
  return webPushPlace({
    userAgent: nav.userAgent ?? '',
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    standalone,
    serviceWorker: 'serviceWorker' in nav,
    pushManager: 'PushManager' in window,
    notification: 'Notification' in window,
    secure: window.isSecureContext,
    built: process.env.NODE_ENV === 'production',
    key: PUBLIC_KEY,
  });
}

/** 'on' = this browser gets notifications for this login; 'off' = it does not; 'blocked' = the browser's setting says no. */
export type WebPushState = 'on' | 'off' | 'blocked';

/** The browser's notification permission, or 'default' where there is none. */
function permission(): NotificationPermission {
  try {
    return Notification.permission;
  } catch {
    return 'default';
  }
}

/** The worker's registration if there is one, without waiting for it. */
async function registration(): Promise<ServiceWorkerRegistration | undefined> {
  try {
    return await navigator.serviceWorker.getRegistration('/');
  } catch {
    return undefined;
  }
}

/** This browser's subscription, if any. */
async function currentSubscription(): Promise<PushSubscription | null> {
  try {
    return (await (await registration())?.pushManager.getSubscription()) ?? null;
  } catch {
    return null;
  }
}

/** The state for My profile: on only when the subscription here is noted as this login's. */
export async function webPushState(): Promise<WebPushState> {
  if (webPushHere() !== 'ready') return 'off';
  if (permission() === 'denied') return 'blocked';
  const subscription = await currentSubscription();
  const saved = parseSaved(readLocal(WEB_PUSH_KEY));
  const user = storedLoginUserId();
  return subscription && saved && user && saved.user === user && saved.endpoint === subscription.endpoint ? 'on' : 'off';
}

/** Saves the subscription for the signed-in login and notes it on the device. False when the server refused. */
async function save(subscription: PushSubscription, user: string): Promise<boolean> {
  const { error } = await supabase.rpc('save_web_push', {
    p_endpoint: subscription.endpoint,
    p_p256dh: base64Url(subscription.getKey('p256dh')),
    p_auth: base64Url(subscription.getKey('auth')),
  });
  if (error) return false;
  writeLocal(WEB_PUSH_KEY, JSON.stringify({ user, endpoint: subscription.endpoint, at: Date.now() }));
  return true;
}

/** Removes the row of `endpoint` for the signed-in login, waiting at most 3 seconds. True when it went (or was gone). */
async function removeOnServer(endpoint: string): Promise<boolean> {
  try {
    const result = await Promise.race([
      supabase.rpc('remove_web_push', { p_endpoint: endpoint }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
    ]);
    return !!result && !result.error;
  } catch {
    return false;
  }
}

/** Resolves with the worker's registration once it is active, or undefined after WORKER_WAIT_MS. */
function readyWorker(): Promise<ServiceWorkerRegistration | undefined> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), WORKER_WAIT_MS)),
  ]);
}

/**
 * Switches notifications on for this browser and the signed-in login. Call straight from the tap: Safari asks for
 * the permission only inside the tap's own handler, so nothing is awaited before the question.
 * Answers 'on', 'blocked' (the person said no, now or before), or 'failed' (no worker, the push service or the
 * server refused, no internet).
 */
export function turnOnWebPush(): Promise<'on' | 'blocked' | 'failed'> {
  const user = storedLoginUserId();
  if (!PUBLIC_KEY || !user || webPushHere() !== 'ready') return Promise.resolve('failed');
  let asked: Promise<NotificationPermission>;
  try {
    asked = Notification.requestPermission();
  } catch {
    return Promise.resolve('failed');
  }
  return asked.then(
    async (answer) => {
      if (answer !== 'granted') return 'blocked';
      try {
        const worker = await readyWorker();
        if (!worker) return 'failed';
        let subscription = await worker.pushManager.getSubscription();
        // One made with another key (the site's pair changed) or noted for another login is ended first.
        const saved = parseSaved(readLocal(WEB_PUSH_KEY));
        if (subscription && (!madeWithKey(subscription.options.applicationServerKey, PUBLIC_KEY) || saved?.user !== user)) {
          await subscription.unsubscribe();
          subscription = null;
        }
        subscription ??= await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(PUBLIC_KEY) });
        if (await save(subscription, user)) return 'on';
        await subscription.unsubscribe().catch(() => false);
        return 'failed';
      } catch {
        return 'failed';
      }
    },
    () => 'failed' as const,
  );
}

/** Switches notifications off for this browser: the server row first (needs the login), then the subscription. */
export async function turnOffWebPush(): Promise<void> {
  const subscription = await currentSubscription();
  const saved = parseSaved(readLocal(WEB_PUSH_KEY));
  const endpoint = subscription?.endpoint ?? saved?.endpoint;
  if (endpoint && saved?.user === storedLoginUserId()) await removeOnServer(endpoint);
  removeLocal(WEB_PUSH_KEY);
  await subscription?.unsubscribe().catch(() => false);
}

/**
 * After a sign-in and at each signed-in start (lib/push.web.ts registerForPush): never asks anything. Saves this
 * login's subscription again once a week, ends one that is not this login's, and cleans up after a permission taken
 * back or a subscription the browser dropped (web-push-rules.ts startAction). Never throws.
 */
export async function refreshWebPush(): Promise<void> {
  const user = storedLoginUserId();
  if (!user || webPushHere() !== 'ready') return;
  try {
    const subscription = await currentSubscription();
    const saved = parseSaved(readLocal(WEB_PUSH_KEY));
    switch (startAction(saved, user, subscription?.endpoint ?? null, permission())) {
      case 'save':
        if (subscription) await save(subscription, user);
        break;
      case 'end':
        await subscription?.unsubscribe();
        if (saved && saved.user !== user) removeLocal(WEB_PUSH_KEY);
        break;
      case 'remove':
        if (subscription && (await removeOnServer(subscription.endpoint))) removeLocal(WEB_PUSH_KEY);
        await subscription?.unsubscribe();
        break;
      case 'forget':
        if (saved && (await removeOnServer(saved.endpoint))) removeLocal(WEB_PUSH_KEY);
        break;
      case 'drop-note':
        removeLocal(WEB_PUSH_KEY);
        break;
      default:
        break;
    }
  } catch {
    // Tried again at the next start.
  }
}

/** Drops the device's note of whose the subscription is (every sign-out, lib/device-traces.ts; #186). */
export function forgetWebPushNote(): void {
  removeLocal(WEB_PUSH_KEY);
}

/**
 * At sign-out, while the login still works (auth-actions signOut, via lib/push.web.ts): removes this login's row and
 * ends the subscription, so the next person on this browser gets nothing of this one's. Waits at most 3 seconds for
 * the server; the worker's unregistering at sign-out ends the subscription anyway.
 */
export async function forgetWebPush(): Promise<void> {
  try {
    const saved = parseSaved(readLocal(WEB_PUSH_KEY));
    const subscription = await currentSubscription();
    if (saved && saved.user === storedLoginUserId()) await removeOnServer(saved.endpoint);
    removeLocal(WEB_PUSH_KEY);
    await subscription?.unsubscribe();
  } catch {
    // Signing out goes on.
  }
}
