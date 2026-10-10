// Keeps what was typed into a long form (register a student, write or edit an announcement) when
// the server ends the login in the middle of it, and fills it in again after the same login signs
// in again (D6-20 part 2, docs/DECISIONS.md #218).
//
// While such a form is open it tells this module what it holds (useDraftKeeper). Nothing is
// written to the device then. Only when a sign-out the person did not ask for arrives
// (src/auth/session-end.ts) are the open forms written to local storage, under the user id of the
// login that typed them. The form takes its draft back when it opens (peekDraft) and deletes it
// from the device once it shows it (discardDraft):
// - only the same login gets it back: another user id never sees it, and the auth provider
//   deletes it as soon as someone else signs in on this device (dropOtherOwnersDrafts);
// - the person's own Sign out deletes every draft (dropAllDrafts): a shared phone keeps nothing;
// - a draft older than DRAFT_DAYS is ignored and deleted.

import { useEffect, useRef } from 'react';

import { readLocal, removeLocal, writeLocal } from './local-storage';

/** The local-storage key the drafts are kept under. */
const STORE_KEY = 'formDrafts';
/** A draft older than this is not offered any more: 7 days. */
export const DRAFT_DAYS = 7;
const DRAFT_MS = DRAFT_DAYS * 24 * 60 * 60 * 1000;

/** What is kept on the device: one login's open forms, by form key. */
export type StoredDrafts = { owner: string; savedAt: number; forms: Record<string, unknown> };

/** The forms open now: form key → the login that fills it and a reader of what it holds. */
const open = new Map<string, { owner: string; read: () => unknown }>();

/** Reads the stored drafts; null when there are none, they are unreadable or too old (then deleted). */
function readStored(now = Date.now()): StoredDrafts | null {
  const text = readLocal(STORE_KEY);
  if (!text) return null;
  try {
    const stored = JSON.parse(text) as StoredDrafts;
    if (typeof stored?.owner === 'string' && typeof stored.savedAt === 'number' && stored.forms && now - stored.savedAt <= DRAFT_MS) {
      return stored;
    }
  } catch {
    // Not ours or damaged: dropped below.
  }
  removeLocal(STORE_KEY);
  return null;
}

/**
 * Writes the forms open now to the device, for their login. Called once, when the server ended the
 * login (src/auth/session-end.ts). A form with nothing worth keeping reports null and is left out.
 */
export function keepOpenDrafts(now = Date.now()): void {
  const forms: Record<string, unknown> = {};
  let owner: string | null = null;
  for (const [key, entry] of open) {
    const value = entry.read();
    if (value === null || value === undefined) continue;
    // One login at a time is signed in; a form of another login (cannot happen) is not kept.
    if (owner !== null && entry.owner !== owner) continue;
    owner = entry.owner;
    forms[key] = value;
  }
  if (owner === null) return;
  // Drafts of the same login kept earlier and not taken back yet stay, unless replaced.
  const earlier = readStored(now);
  const kept = earlier && earlier.owner === owner ? earlier.forms : {};
  const stored: StoredDrafts = { owner, savedAt: now, forms: { ...kept, ...forms } };
  writeLocal(STORE_KEY, JSON.stringify(stored));
}

/** The draft kept for this form and this login, or null. Leaves it on the device (see discardDraft). */
export function peekDraft<T>(key: string, owner: string | null | undefined): T | null {
  if (!owner) return null;
  const stored = readStored();
  if (!stored || stored.owner !== owner) return null;
  return (stored.forms[key] as T | undefined) ?? null;
}

/** Deletes this form's draft from the device, once the form shows it or no longer needs it. */
export function discardDraft(key: string): void {
  const stored = readStored();
  if (!stored || !(key in stored.forms)) return;
  const rest = { ...stored.forms };
  delete rest[key];
  if (Object.keys(rest).length === 0) removeLocal(STORE_KEY);
  else writeLocal(STORE_KEY, JSON.stringify({ ...stored, forms: rest }));
}

/** Deletes every draft: the person's own Sign out (src/auth/auth-actions.ts). */
export function dropAllDrafts(): void {
  removeLocal(STORE_KEY);
}

/** Deletes drafts that belong to another login than the one signed in now (src/auth/auth-provider.tsx). */
export function dropOtherOwnersDrafts(owner: string): void {
  const stored = readStored();
  if (stored && stored.owner !== owner) removeLocal(STORE_KEY);
}

/**
 * Tells this module what an open form holds, so it can be kept if the server ends the login.
 * @param key names the form, e.g. 'register' or 'announcement-edit:12'.
 * @param owner the user id of the signed-in login; nothing is kept without one.
 * @param value what to keep, or null while there is nothing worth keeping (an empty form, a form
 *   already saved). Must survive JSON (plain objects, strings, numbers, booleans).
 */
export function useDraftKeeper(key: string, owner: string | null | undefined, value: unknown): void {
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);
  useEffect(() => {
    if (!owner) return;
    const entry = { owner, read: () => latest.current };
    open.set(key, entry);
    return () => {
      // Only this form's own entry: a newer screen with the same key may have taken it over.
      if (open.get(key) === entry) open.delete(key);
    };
  }, [key, owner]);
}
