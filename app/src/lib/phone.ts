// Phone numbers in E.164 (+ country code + number, e.g. +919876543210), the form the database keeps
// for About you and the desk (migration 0036, docs/DECISIONS.md #164, docs/I18N.md P2). Checked
// with libphonenumber-js's small ("min") metadata: pure JavaScript, no native code.

import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js/min';

import { asciiDigits } from './digits';

export type { CountryCode };

/** Every country the phone metadata knows, as ISO 3166 codes ('IN', 'US' ...). */
export const PHONE_COUNTRIES: readonly CountryCode[] = getCountries();

/** True when `code` is a country the phone metadata knows. */
export function isPhoneCountry(code: string | null | undefined): code is CountryCode {
  return !!code && (PHONE_COUNTRIES as readonly string[]).includes(code);
}

/** '+91' for 'IN'. */
export function callingCode(country: CountryCode): string {
  return `+${getCountryCallingCode(country)}`;
}

/**
 * The typed number in E.164, or null when it is not a real number. `typed` may already carry a +
 * and a country code (then `country` is ignored), or be the number as dialled in `country`.
 * Digits of other scripts are read too (D8-16).
 */
export function toE164(typed: string, country: CountryCode): string | null {
  const text = asciiDigits(typed).trim();
  if (!text) return null;
  const parsed = parsePhoneNumberFromString(text, country);
  return parsed && parsed.isValid() ? parsed.number : null;
}

/** The country and the national part of a stored E.164 number, for the form; null when unreadable. */
export function splitE164(e164: string | null | undefined): { country: CountryCode; national: string } | null {
  if (!e164) return null;
  const parsed = parsePhoneNumberFromString(e164);
  if (!parsed?.country) return null;
  return { country: parsed.country, national: parsed.formatNational() };
}

/** A stored number for reading: '+91 98765 43210'; the text as it is when it cannot be read. */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return '';
  const parsed = parsePhoneNumberFromString(e164);
  return parsed ? parsed.formatInternational() : e164;
}

/** The country's name in `language`, e.g. 'India'; the code itself where Intl cannot name it. */
export function countryName(code: string, language: string): string {
  try {
    return new Intl.DisplayNames([language, 'en'], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}
