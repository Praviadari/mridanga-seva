// Push notifications for announcements, Android app only (docs/DECISIONS.md #33). The web
// version uses ./push.web.ts, which does nothing; iPhone web push comes later.
//
// After sign-in the app asks once for permission, gets this phone's Expo push token and saves it
// with register_push_token (migration 0011). When an announcement is published, the Edge Function
// notify-announcements sends it to the phones of the people it is addressed to. Tapping the
// notification opens the announcement. At sign-out the token is deleted, so the next person on a
// shared phone does not get this person's notifications.
//
// Everything here gives up quietly when push is not set up: in Expo Go (which has no push on
// Android since SDK 53), before `eas init` (no project id), before the Firebase key is uploaded
// (no token), or when the person says no. The app then works exactly as without push.
// expo-notifications is loaded only when push can work: merely loading it in Expo Go prints a
// warning on every start.

import Constants, { ExecutionEnvironment } from 'expo-constants';
import { router, type Href } from 'expo-router';
import type * as NotificationsModule from 'expo-notifications';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { belongsTo, rememberRequestedPath } from '@/auth/requested-path';
import type { Area } from '@/auth/types';
import i18n from '@/i18n';

import { supabase } from './supabase';

type Notifications = typeof NotificationsModule;

/** The Android notification channel; the Edge Function sends with the same id (messages.ts). */
const CHANNEL_ID = 'announcements';

/** The token this phone saved for the signed-in person, so sign-out can delete it. */
let savedToken: string | null = null;

/** Notifications whose tap has been handled, so one tap never opens the screen twice. */
const handled = new Set<string>();

/** The EAS project id written into app.json by `eas init`; without it there is no push token. */
function easProjectId(): string | undefined {
  const fromConfig = (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId;
  return fromConfig ?? Constants.easConfig?.projectId ?? undefined;
}

/** True when this build can receive push at all: the Android app built by EAS, not Expo Go. */
function pushPossible(): boolean {
  return (
    Platform.OS === 'android' &&
    Constants.executionEnvironment !== ExecutionEnvironment.StoreClient &&
    easProjectId() !== undefined
  );
}

/** expo-notifications, loaded once on first use; null when push cannot work on this build. */
let loading: Promise<Notifications | null> | null = null;
function notifications(): Promise<Notifications | null> {
  loading ??= pushPossible()
    ? import('expo-notifications').then(
        (module) => {
          try {
            return setUp(module);
          } catch {
            return null; // Push stays off; the app works as without it.
          }
        },
        () => null,
      )
    : Promise.resolve(null);
  return loading;
}

/**
 * First-time setup once the module is loaded: show notifications even while the app is open,
 * and remember the announcement of a tap that started the app, like a link
 * (src/auth/requested-path.ts), so the start page opens it once the login is checked.
 */
function setUp(module: Notifications): Notifications {
  module.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  const first = module.getLastNotificationResponse();
  const screen = screenOf(first);
  if (first && screen) {
    handled.add(first.notification.request.identifier);
    rememberRequestedPath(screen);
    module.clearLastNotificationResponse();
  }
  return module;
}

// Loaded at start (it is part of the app already, so this is quick), before the login check
// finishes, so a tap that opened the app is not missed.
void notifications();

/**
 * The screen a notification asks to open: an announcement, or (Phase 2, migration 0012) a student's
 * assessment or a recording to review; never anything else.
 */
function screenOf(response: NotificationsModule.NotificationResponse | null): string | null {
  const url = response?.notification.request.content.data?.url;
  return typeof url === 'string'
    && /^\/(((staff|student)\/announcements|student\/assessments|staff\/assessments\/review|staff\/promotion)\/\d+|student\/progress)$/.test(url)
    ? url
    : null;
}

/**
 * Asks for permission (once; Android 13 and later show the question) and saves this phone's
 * push token for the signed-in person. Call after sign-in, for students and staff. Never throws
 * and never shows an error: without push the app works as before.
 */
export async function registerForPush(): Promise<void> {
  const module = await notifications();
  const projectId = easProjectId();
  if (!module || !projectId) return;
  try {
    // The channel must exist before Android 13 shows the permission question.
    await module.setNotificationChannelAsync(CHANNEL_ID, {
      name: i18n.t('push.channelName'),
      description: i18n.t('push.channelDescription'),
      importance: module.AndroidImportance.HIGH,
    });
    const current = await module.getPermissionsAsync();
    let status = current.status;
    if (status !== 'granted' && current.canAskAgain) status = (await module.requestPermissionsAsync()).status;
    if (status !== 'granted') return;
    const token = (await module.getExpoPushTokenAsync({ projectId })).data;
    const { error } = await supabase.rpc('register_push_token', { p_token: token, p_platform: 'android' });
    if (!error) savedToken = token;
  } catch {
    // For example no Firebase key yet, or no internet: try again at the next start.
  }
}

/**
 * Deletes this phone's token for the signed-in person. Call just before signing out, while the
 * login still works. Waits at most 3 seconds, so signing out never hangs without internet; the
 * next person to sign in on the phone takes the token over anyway.
 */
export async function unregisterPush(): Promise<void> {
  const token = savedToken;
  if (!token) return;
  savedToken = null;
  try {
    await Promise.race([
      supabase.from('push_tokens').delete().eq('token', token),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
  } catch {
    // Signing out goes on.
  }
}

/**
 * Handles taps on notifications while the app is running: opens the announcement when it
 * belongs to the person's area, or remembers it until they have signed in. Use once, in the root
 * layout, with the current area.
 */
export function usePushTaps(area: Area): void {
  useEffect(() => {
    let subscription: { remove: () => void } | null = null;
    let cancelled = false;
    void notifications().then((module) => {
      if (!module || cancelled) return;
      subscription = module.addNotificationResponseReceivedListener((response) => {
        const id = response.notification.request.identifier;
        const screen = screenOf(response);
        if (!screen || handled.has(id)) return;
        handled.add(id);
        if (area === 'guru' || area === 'coordinator' || area === 'student') {
          // A notification meant for another login on this phone (another area) is ignored.
          if (belongsTo(screen, area)) router.push(screen as Href);
        } else {
          rememberRequestedPath(screen);
        }
      });
    });
    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [area]);
}
