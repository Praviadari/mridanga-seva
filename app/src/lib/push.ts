// Push notifications for announcements, Android app only (docs/DECISIONS.md #33). The web
// version uses ./push.web.ts: web push, switched on by a tap in My profile (./web-push.web.ts, 0062, #603).
//
// After sign-in the app asks once for permission, gets this phone's Expo push token and saves it
// with register_push_token (migration 0011). When an announcement is published, the Edge Function
// notify-announcements sends it to the phones of the people it is addressed to. Tapping the
// notification opens the announcement. At sign-out the token is deleted, so the next person on a
// shared phone does not get this person's notifications.
//
// Everything here gives up quietly when push is not set up: in Expo Go (which has no push on
// Android since SDK 53), before `eas init` (no project id), before the Firebase key is uploaded
// (no token), or when the person says no. The app then works exactly as without push; a refusal or a
// failed registration shows as a quiet notice on the homes and My profile (src/lib/push-state.ts, #305).
// expo-notifications is loaded only when push can work: merely loading it in Expo Go prints a
// warning on every start.

import Constants, { ExecutionEnvironment } from 'expo-constants';
import { router, type Href } from 'expo-router';
import type * as NotificationsModule from 'expo-notifications';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { belongsTo, rememberRequestedPath } from '@/auth/requested-path';
import type { Area } from '@/auth/types';
import { isNoticeScreen } from '@/data/notifications';
import i18n from '@/i18n';

import { readLocal, removeLocal, writeLocal } from './local-storage';
import { forgetRegistration, recentRegistration, rememberRegistration } from './push-registered';
import { setPushState } from './push-state';
import { storedLoginUserId, supabase } from './supabase';

type Notifications = typeof NotificationsModule;

/** The Android notification channel; the Edge Function sends with the same id (messages.ts). */
const CHANNEL_ID = 'announcements';

/**
 * The token this phone saved for the signed-in person, so sign-out can delete it. Also kept on the
 * device (PUSH_TOKEN_KEY), so a sign-out in a later app run, before push has registered again, still
 * deletes it (D2-05).
 */
let savedToken: string | null = null;
const PUSH_TOKEN_KEY = 'pushToken';


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

/**
 * expo-notifications, loaded once on first use; null when push cannot work on this build. The daily practice
 * reminder (lib/practice-reminder.ts, #402) uses the same module, set up the same way.
 */
let loading: Promise<Notifications | null> | null = null;
export function notifications(): Promise<Notifications | null> {
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
  // While nobody is signed in on this phone, a notice that still arrives (its token could not be
  // deleted for lack of internet) is not shown: it is someone else's (FLOW-04).
  module.setNotificationHandler({
    handleNotification: async () => {
      const signedIn = storedLoginUserId() !== null;
      return { shouldShowBanner: signedIn, shouldShowList: signedIn, shouldPlaySound: signedIn, shouldSetBadge: false };
    },
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
 * The screen a notification asks to open: an announcement, or (Phase 2, migrations 0016, 0017) a
 * student's assessment, a recording to review, a nomination or My progress; never anything else
 * (the inbox's list, data/notifications.ts).
 */
function screenOf(response: NotificationsModule.NotificationResponse | null): string | null {
  const url = response?.notification.request.content.data?.url;
  return typeof url === 'string' && isNoticeScreen(url) ? url : null;
}

/** The registration running now, so a start and a return to the front never register twice at once. */
let registering: Promise<void> | null = null;

/**
 * Asks for permission (Android 13 and later show the question) and saves this phone's push token
 * for the signed-in person. Call after sign-in, for students and staff, and again when the app comes
 * back to the front while pushNeedsRetry() (src/lib/push-state.ts). Never throws: without push the
 * app works as before. The outcome goes to push-state, so a refusal or a failure shows as a quiet
 * notice on the homes and My profile (audit R5-04, docs/DECISIONS.md #305) instead of nothing. The
 * error codes listed with register_push_token in 0011 are not translated: any refusal is 'failed'.
 * @param options.ask false on a return to the front: check the permission without asking again
 *   (the person may have turned it on in the phone's settings).
 */
export function registerForPush(options: { ask?: boolean } = {}): Promise<void> {
  registering ??= register(options.ask ?? true).finally(() => {
    registering = null;
  });
  return registering;
}

async function register(ask: boolean): Promise<void> {
  const module = await notifications();
  const projectId = easProjectId();
  if (!module || !projectId) {
    setPushState('off');
    return;
  }
  try {
    // The channel must exist before Android 13 shows the permission question.
    await module.setNotificationChannelAsync(CHANNEL_ID, {
      name: i18n.t('push.channelName'),
      description: i18n.t('push.channelDescription'),
      importance: module.AndroidImportance.HIGH,
    });
    const current = await module.getPermissionsAsync();
    let status = current.status;
    if (status !== 'granted' && current.canAskAgain && ask) status = (await module.requestPermissionsAsync()).status;
    if (status !== 'granted') {
      setPushState('denied');
      return;
    }
    const user = storedLoginUserId();
    // Registered within the week for this login: no call to Expo or the database (P4-05, src/lib/push-registered.ts).
    const recent = recentRegistration(user, readLocal(PUSH_TOKEN_KEY));
    if (recent) {
      savedToken = recent;
      setPushState('on');
      return;
    }
    const token = (await module.getExpoPushTokenAsync({ projectId })).data;
    const { error } = await supabase.rpc('register_push_token', { p_token: token, p_platform: 'android' });
    if (!error) {
      savedToken = token;
      writeLocal(PUSH_TOKEN_KEY, token);
      if (user) rememberRegistration(user, token);
    }
    setPushState(error ? 'failed' : 'on');
  } catch {
    // For example no Firebase key yet, or no internet: tried again when the app comes back to the front.
    setPushState('failed');
  }
}

/**
 * Deletes this phone's token for the signed-in person: the one saved in this app run, or the copy
 * kept on the device from an earlier run (D2-05). Call just before signing out, while the login
 * still works. Waits at most 3 seconds, so signing out never hangs without internet; the device's
 * copy is kept until a delete works, and the next person to sign in on the phone takes the token
 * over anyway.
 */
export async function unregisterPush(): Promise<void> {
  // The next login on this phone starts with no notice; its own registration sets the state.
  setPushState('unknown');
  // Signing in again registers at once, whoever it is (P4-05).
  forgetRegistration();
  const token = savedToken ?? readLocal(PUSH_TOKEN_KEY);
  if (!token) return;
  savedToken = null;
  try {
    const result = await Promise.race([
      supabase.from('push_tokens').delete().eq('token', token),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
    ]);
    if (result && !result.error) removeLocal(PUSH_TOKEN_KEY);
  } catch {
    // Signing out goes on.
  }
}

/**
 * Removes this app's notifications from the phone's notification list, so the next person on a
 * shared phone does not read the last person's (FLOW-04). Used at every sign-out.
 */
export async function dismissNotifications(): Promise<void> {
  const module = await notifications();
  try {
    await module?.dismissAllNotificationsAsync();
  } catch {
    // Nothing to remove, or push is not set up.
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
