// The signed-in student's own record, for the Student screens: the My QR card (S3) now, the
// student home (S1) later. Row-level security lets a student read only their own students row
// (policy own_or_staff in supabase/migrations/0001_phase1.sql), so the app never sees anyone else's.
//
// My QR has to work at the door even when the phone has no signal, so the last card loaded is
// kept on this device, shown at once while the server is asked, and kept on screen with a note
// when the server cannot be reached (docs/DECISIONS.md #21).

import { readLocal, removeLocal, writeLocal } from '@/lib/local-storage';
import { supabase } from '@/lib/supabase';

import { isNetworkError, type MessageKey } from './errors';

/** What the My QR card shows. */
export type MyCard = {
  fullName: string;
  /** Null only in the moment before the database gives the number; shown as nothing. */
  rollNo: string | null;
  /** The secret value the QR code carries (students.qr_token). Never the roll number. */
  qrToken: string;
};

/** Result of loading the card. */
export type MyCardResult =
  /** `saved` is true when the server could not be reached and the copy on this device is shown. */
  | { state: 'ok'; card: MyCard; saved: boolean }
  /** This login is not linked to a student record (for example the record was removed). */
  | { state: 'noRecord' }
  /** Could not load, and no copy is saved on this device. */
  | { state: 'failed'; errorKey: MessageKey };

/** Device storage key for the saved card. One card per device: only one person is signed in. */
const SAVED_CARD_KEY = 'myCard';

/** The saved card, with the login it belongs to, so it is never shown to a different login. */
type SavedCard = MyCard & { profileId: string };

/**
 * Loads the signed-in student's card from the server, and keeps a copy on this device. When the
 * server cannot be reached, returns the saved copy instead, if it belongs to this login.
 * @param profileId the signed-in login's id (profiles.id, the same as the Supabase user id).
 */
export async function fetchMyCard(profileId: string): Promise<MyCardResult> {
  const { data, error } = await supabase
    .from('students')
    .select('full_name, roll_no, qr_token')
    .eq('profile_id', profileId)
    .maybeSingle<{ full_name: string; roll_no: string | null; qr_token: string }>();

  if (error) {
    const saved = savedCardFor(profileId);
    if (saved) return { state: 'ok', card: saved, saved: true };
    return { state: 'failed', errorKey: isNetworkError(error.message) ? 'common.networkError' : 'common.genericError' };
  }
  if (!data) {
    // The record is gone or unlinked, so a saved copy would be a code the scanner no longer knows.
    clearSavedCard();
    return { state: 'noRecord' };
  }

  const card: MyCard = { fullName: data.full_name, rollNo: data.roll_no, qrToken: data.qr_token };
  writeLocal(SAVED_CARD_KEY, JSON.stringify({ ...card, profileId } satisfies SavedCard));
  return { state: 'ok', card, saved: false };
}

/**
 * Deletes the card saved on this device. Called on sign-out, because a family may share one
 * phone and the next person must not find this student's code.
 */
export function clearSavedCard(): void {
  removeLocal(SAVED_CARD_KEY);
}

/**
 * The card saved on this device for this login, else null (also when it cannot be read). My QR
 * shows it at once while fetchMyCard asks the server, because without signal the database client
 * retries a failed request for several seconds before it gives up.
 * @param profileId the signed-in login's id; a card saved for another login is never returned.
 */
export function savedCardFor(profileId: string): MyCard | null {
  const text = readLocal(SAVED_CARD_KEY);
  if (!text) return null;
  try {
    const saved = JSON.parse(text) as Partial<SavedCard>;
    if (saved.profileId !== profileId || typeof saved.qrToken !== 'string') return null;
    return { fullName: saved.fullName ?? '', rollNo: saved.rollNo ?? null, qrToken: saved.qrToken };
  } catch {
    return null;
  }
}
