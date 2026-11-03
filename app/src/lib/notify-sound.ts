// Which sound the app's notifications make on this phone: the class's khol (#793) or the kartal (docs/DECISIONS.md
// #803, the 1.1.0 APK carries res/raw/kartal_notify.wav, scripts/make-kartal-sound.mjs). Android fixes a channel's
// sound when it is created, so each sound has its own channel ids; the choice picks which id the phone uses, and never
// changes an existing channel. Kept on this phone, for whoever uses it (a sound is not personal data, so sign-out
// leaves it). The practice reminder follows it at once. Announcements keep sending on the khol channel until the
// server learns each phone's choice (0074 and notify-announcements, OPERATIONS "Notification sounds"): then they
// follow by update, with no new APK, since the kartal channel is already made here.

import { readLocal, writeLocal } from './local-storage';

/** The two sounds. */
export type NotifySound = 'khol' | 'kartal';
export const NOTIFY_SOUNDS: readonly NotifySound[] = ['khol', 'kartal'];

const KEY = 'notifySound';

/** The file in res/raw (app.json expo-notifications "sounds") for each sound. */
export const SOUND_FILE: Record<NotifySound, string> = { khol: 'khol_notify.wav', kartal: 'kartal_notify.wav' };

/** The announcement channel for each sound; the khol one is what notify-announcements sends with (messages.ts). */
export const ANNOUNCE_CHANNEL: Record<NotifySound, string> = { khol: 'announcements-khol', kartal: 'announcements-kartal' };

/** The practice reminder's channel for each sound (#402, #794). */
export const PRACTICE_CHANNEL: Record<NotifySound, string> = { khol: 'practice-khol', kartal: 'practice-kartal' };

/** This phone's choice; the khol until one is made. */
export function readNotifySound(): NotifySound {
  return readLocal(KEY) === 'kartal' ? 'kartal' : 'khol';
}

/** Keeps the choice on this phone. */
export function saveNotifySound(sound: NotifySound): void {
  writeLocal(KEY, sound);
}
