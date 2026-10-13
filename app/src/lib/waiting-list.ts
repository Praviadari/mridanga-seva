// The sign-ups waiting for the desk on Register a student (docs/DECISIONS.md #291, audit R2-01): the whole
// list, searched by name, email or phone and shown a page at a time, and what each row may do. Before this
// only the 10 newest were drawn, so an earlier sign-up could not be found. Pure functions, unit-tested
// (tests/weekend-app.test.mjs).

import type { WaitingSignUp } from '@/data/about';
import { ageFromForm } from '@/data/students';
import { asciiDigits } from '@/lib/digits';
import { formatTypedDate } from '@/lib/dates';
import { checkPersonName } from '@/lib/person-name';

/** Rows drawn at first, and added by each "Show more". */
export const WAITING_PAGE = 10;

/** Fewest digits typed before the phone numbers are searched too ("98" would match nearly everyone). */
const MIN_PHONE_DIGITS = 3;

/** Lower case, accents and vowel signs kept, spaces collapsed: how a name or email is compared. */
function folded(text: string): string {
  let value = text;
  try {
    value = value.normalize('NFC');
  } catch {
    // An engine without normalize compares the text as typed.
  }
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Only the digits of a phone number as typed or stored ('+91 98765 43210' → '919876543210'). */
function digitsOf(text: string): string {
  return asciiDigits(text).replace(/\D/g, '');
}

/**
 * True when the sign-up matches what the coordinator typed: part of the name or the email, or at least
 * three digits of the phone (spaces and +91 do not matter). An empty search matches everyone.
 */
export function matchesWaiting(person: Pick<WaitingSignUp, 'full_name' | 'email' | 'phone'>, query: string): boolean {
  const q = folded(query);
  if (!q) return true;
  if (folded(person.full_name ?? '').includes(q) || folded(person.email ?? '').includes(q)) return true;
  const digits = digitsOf(q);
  return digits.length >= MIN_PHONE_DIGITS && digits.length === q.replace(/[\s+()-]/g, '').length
    && digitsOf(person.phone ?? '').includes(digits);
}

/** The sign-ups that match the search, in the server's order (newest first). */
export function filterWaiting<T extends Pick<WaitingSignUp, 'full_name' | 'email' | 'phone'>>(list: readonly T[], query: string): T[] {
  return list.filter((person) => matchesWaiting(person, query));
}

/**
 * What the desk may do with a waiting sign-up: 'accept' (an adult with a date of birth, a name that passes
 * the name rule and the privacy tick), or why only Fill the form: 'minor' (under 18, comes with a parent),
 * 'noDob', 'name' (a sign-up from before #267) or 'noNotice' (no privacy tick: an older build, FF-01;
 * Accept would answer notice_not_accepted since 0047). undefined notice_version = a server before 0047,
 * which does not ask for it.
 */
export type WaitingAction = 'accept' | 'minor' | 'noDob' | 'name' | 'noNotice';

/** See WaitingAction. */
export function waitingAction(person: Pick<WaitingSignUp, 'full_name' | 'dob' | 'notice_version'>): WaitingAction {
  const age = person.dob ? ageFromForm(formatTypedDate(person.dob)) : null;
  if (!age) return 'noDob';
  if (age.minor) return 'minor';
  if (checkPersonName(person.full_name, { max: 100 }) !== null) return 'name';
  if (person.notice_version === null) return 'noNotice';
  return 'accept';
}
