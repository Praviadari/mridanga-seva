// Where the signed-in person's class is: the IANA time zone and the country (ISO 3166) of their
// centre. Every "today", every time of day and the number and date formats follow it
// (docs/I18N.md, docs/DECISIONS.md #132). Until the database says otherwise it is India, the
// first centre, so a phone that never signed in, or a database without migration 0033, works as
// before.

import { readLocal, writeLocal } from './local-storage';
import { supabase } from './supabase';

export type ClassLocale = {
  /** IANA name, e.g. 'Asia/Kolkata', 'America/New_York'. */
  timeZone: string;
  /** Two capital letters, e.g. 'IN', 'US'. */
  country: string;
};

export const DEFAULT_CLASS_LOCALE: ClassLocale = { timeZone: 'Asia/Kolkata', country: 'IN' };

const STORAGE_KEY = 'classLocale';

function isClassLocale(value: unknown): value is ClassLocale {
  if (typeof value !== 'object' || value === null) return false;
  const { timeZone, country } = value as Record<string, unknown>;
  return (
    typeof timeZone === 'string' &&
    /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)+$/.test(timeZone) &&
    typeof country === 'string' &&
    /^[A-Z]{2}$/.test(country)
  );
}

function readSaved(): ClassLocale {
  try {
    const saved: unknown = JSON.parse(readLocal(STORAGE_KEY) ?? 'null');
    return isClassLocale(saved) ? saved : DEFAULT_CLASS_LOCALE;
  } catch {
    return DEFAULT_CLASS_LOCALE;
  }
}

// The last one known on this device, so the first screen after a start already uses it.
let current: ClassLocale = readSaved();

/** The signed-in person's centre's zone and country (India until known). */
export function classLocale(): ClassLocale {
  return current;
}

/**
 * Asks the database for the signed-in person's centre's zone and country and remembers them on
 * this device. Not awaited by callers: a failure (no internet, a database before 0033) keeps the
 * last known values.
 */
export async function loadClassLocale(): Promise<void> {
  const { data, error } = await supabase.rpc('my_centre_locale');
  if (error || typeof data !== 'object' || data === null) return;
  const row = data as { time_zone?: unknown; country_code?: unknown };
  const next = { timeZone: row.time_zone, country: row.country_code };
  if (!isClassLocale(next)) return;
  current = next;
  writeLocal(STORAGE_KEY, JSON.stringify(next));
}
