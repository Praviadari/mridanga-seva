// Push notifications in the web version (migration 0062, docs/DECISIONS.md #596-#609). Metro uses this file instead
// of ./push.ts on the web, because expo-notifications does not work in a browser. Web push itself is
// ./web-push.web.ts: switched on only by a tap in My profile, never here. These are the root layout's and sign-out's
// hooks into it: a signed-in start keeps the browser's subscription current (or ends one that is not this login's),
// sign-out removes it, and a tap on a notification while the app is open opens its screen. push-state stays
// 'unknown' on the web, so the phone's notice (components/push-notice.tsx) never shows here.

import { router, type Href } from 'expo-router';
import { useEffect } from 'react';

import { belongsTo, rememberRequestedPath } from '@/auth/requested-path';
import type { Area } from '@/auth/types';
import { isNoticeScreen } from '@/data/notifications';

import { forgetWebPush, refreshWebPush } from './web-push';

/**
 * After a sign-in and at each signed-in start: keeps this browser's subscription current for this login, never asks.
 * `options` matches ./push.ts; a return to the front (ask false) changes nothing on the web.
 */
export async function registerForPush(options: { ask?: boolean } = {}): Promise<void> {
  if (options.ask === false) return;
  await refreshWebPush();
}

/** Before signing out, while the login works: removes this browser's subscription for this login. */
export async function unregisterPush(): Promise<void> {
  await forgetWebPush();
}

/** Nothing to clear: the browser's notification list belongs to the browser, and the worker is removed at sign-out. */
export async function dismissNotifications(): Promise<void> {}

/**
 * A tap on a notification while the app is open: the service worker focuses this window and posts the screen
 * ({type: 'open', url}, scripts/service-worker.js 'notificationclick'). It opens when it belongs to the signed-in area,
 * or is remembered until a sign-in, as on the phones (./push.ts). With no window open the worker opens the address
 * itself, which the start page handles like any link.
 */
export function usePushTaps(area: Area): void {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: unknown; url?: unknown } | null;
      if (data?.type !== 'open' || typeof data.url !== 'string' || !isNoticeScreen(data.url)) return;
      if (area === 'guru' || area === 'coordinator' || area === 'student') {
        if (belongsTo(data.url, area)) router.push(data.url as Href);
      } else {
        rememberRequestedPath(data.url);
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [area]);
}
