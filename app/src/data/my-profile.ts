// A3 Profile: the signed-in person's own name and phone. Row-level security lets a person
// update only their own profile (policy own_update, 0001); a database trigger trims and checks
// both (guard_profile_details in 0013, docs/DECISIONS.md #44). Role, email and active cannot be
// changed here. A student's name on the roll (students.full_name, on the QR card) is the
// coordinators' record and stays as registered.

import type { ParseKeys } from 'i18next';

import { supabase } from '@/lib/supabase';

import { isNetworkError } from './errors';

/** A translation key for a message. */
type MessageKey = ParseKeys;

/** Longest name, as in the database. */
export const NAME_MAX = 80;

/** What the form edits. */
export type MyDetails = { fullName: string; phone: string };

/** Problems with the form, per field. Empty = fine. */
export type MyDetailsErrors = Partial<Record<'fullName' | 'phone', MessageKey>>;

/** Checks the form before saving; the database checks the same. */
export function checkMyDetails(details: MyDetails): MyDetailsErrors {
  const errors: MyDetailsErrors = {};
  const name = details.fullName.trim();
  if (!name) errors.fullName = 'myProfile.errors.nameRequired';
  else if (name.length > NAME_MAX) errors.fullName = 'myProfile.errors.nameTooLong';
  const phone = details.phone.trim();
  if (phone && !/^\+?[0-9 ]{7,20}$/.test(phone)) errors.phone = 'myProfile.errors.phoneInvalid';
  return errors;
}

/** Loads the phone (the name is already in the signed-in profile). null = could not be loaded. */
export async function fetchMyPhone(profileId: string): Promise<string | null | undefined> {
  const { data, error } = await supabase
    .from('profiles')
    .select('phone')
    .eq('id', profileId)
    .maybeSingle<{ phone: string | null }>();
  if (error) return undefined;
  return data?.phone ?? null;
}

/** Saves the name and phone. Nothing = saved. */
export async function saveMyDetails(profileId: string, details: MyDetails): Promise<{ errorKey?: MessageKey }> {
  const { data, error } = await supabase
    .from('profiles')
    .update({ full_name: details.fullName.trim(), phone: details.phone.trim() || null })
    .eq('id', profileId)
    .select('id');
  if (error) {
    if (error.message === 'name_required') return { errorKey: 'myProfile.errors.nameRequired' };
    if (error.message === 'name_too_long') return { errorKey: 'myProfile.errors.nameTooLong' };
    if (error.message === 'phone_invalid') return { errorKey: 'myProfile.errors.phoneInvalid' };
    if (isNetworkError(error.message)) return { errorKey: 'common.networkError' };
    return { errorKey: 'common.genericError' };
  }
  return data.length === 0 ? { errorKey: 'common.genericError' } : {};
}
