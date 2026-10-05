// Ishtagoshti part 2, free public sign-up (Phase 2 slice 7, docs/DECISIONS.md #72): a login without a
// class role joins Ishtagoshti (I14) — year of birth, optional phone, the terms; under 18 the parent's
// name and email, and a 6-digit code the database emails to the parent — and the Guru's subscriber
// list (I15: block / unblock, joins per week). Database: supabase/migrations/0025_ishtagoshti_public.sql.
// A subscriber's role stays 'pending'; ig_reader() lets it read slokas and themes and keep its own
// notes and ticks, nothing else. The code never comes back to the app.

import type { ParseKeys } from 'i18next';

import type { IgState } from '@/auth/types';
import { supabase } from '@/lib/supabase';

import { isNetworkError } from './errors';

type MessageKey = ParseKeys;

/**
 * The version of the consent and notice texts a person agrees to, stored with the subscription.
 * PLACEHOLDER texts until the team gives the wording (ishtagoshtiJoin.terms*): change this when they do.
 */
export const IG_TERMS_VERSION = 'placeholder-2026-10';

/** The caller's subscription (ig_my_state). */
export type MySubscription = {
  state: IgState;
  minor: boolean;
  birthYear: number | null;
  phone: string | null;
  parentName: string | null;
  parentEmail: string | null;
  parentRelation: string | null;
  codeSentAt: string | null;
};

type StateRow = {
  state: IgState;
  minor?: boolean;
  birth_year?: number | null;
  phone?: string | null;
  parent_name?: string | null;
  parent_email?: string | null;
  parent_relation?: string | null;
  code_sent_at?: string | null;
};

function subscriptionOf(row: StateRow): MySubscription {
  return {
    state: row.state,
    minor: row.minor ?? false,
    birthYear: row.birth_year ?? null,
    phone: row.phone ?? null,
    parentName: row.parent_name ?? null,
    parentEmail: row.parent_email ?? null,
    parentRelation: row.parent_relation ?? null,
    codeSentAt: row.code_sent_at ?? null,
  };
}

/** The caller's subscription, or null when it could not be loaded. */
export async function fetchMySubscription(): Promise<MySubscription | null> {
  const { data, error } = await supabase.rpc('ig_my_state');
  if (error || !data) return null;
  return subscriptionOf(data as StateRow);
}

/** What the join form sends. */
export type JoinInput = {
  birthYear: number;
  turned18: boolean;
  phone: string;
  parentName: string;
  parentEmail: string;
  parentRelation: string;
};

/**
 * Age from a year of birth in the given year: under 18, 18 this year (ask about the birthday) or adult.
 * The database decides the same way (ig_join).
 */
export function ageGroup(birthYear: number, thisYear: number): 'minor' | 'eighteen' | 'adult' {
  const age = thisYear - birthYear;
  if (age < 18) return 'minor';
  return age === 18 ? 'eighteen' : 'adult';
}

/** I14: joins Ishtagoshti (or corrects the details while the parent has not confirmed). */
export async function joinIshtagoshti(input: JoinInput): Promise<MySubscription | { errorKey: MessageKey }> {
  const { data, error } = await supabase.rpc('ig_join', {
    p_birth_year: input.birthYear,
    p_terms_version: IG_TERMS_VERSION,
    p_turned_18: input.turned18,
    p_phone: input.phone.trim() || null,
    p_parent_name: input.parentName.trim() || null,
    p_parent_email: input.parentEmail.trim() || null,
    p_parent_relation: input.parentRelation.trim() || null,
  });
  if (error || !data) return { errorKey: errorKeyOf(error?.message) };
  return subscriptionOf(data as StateRow);
}

/** I14, a minor: asks the database to email a new code to the parent. 'sent' or 'not_set_up'. */
export async function sendParentCode(): Promise<'sent' | 'not_set_up' | { errorKey: MessageKey }> {
  const { data, error } = await supabase.rpc('ig_send_parent_code');
  if (error) return { errorKey: errorKeyOf(error.message) };
  return data === 'sent' ? 'sent' : 'not_set_up';
}

/** What ig_confirm_parent answers. */
export type ConfirmResult = 'confirmed' | 'wrong' | 'expired' | 'too_many' | 'no_code';

/** I14, a minor: types the parent's code. */
export async function confirmParentCode(code: string): Promise<ConfirmResult | { errorKey: MessageKey }> {
  const { data, error } = await supabase.rpc('ig_confirm_parent', { p_code: code.trim() });
  if (error) return { errorKey: errorKeyOf(error.message) };
  return data as ConfirmResult;
}

/** Leaves Ishtagoshti: the details, notes and ticks are deleted. */
export async function leaveIshtagoshti(): Promise<MessageKey | null> {
  const { error } = await supabase.rpc('ig_leave');
  return error ? errorKeyOf(error.message) : null;
}

// ---------------------------------------------------------------- I15, the Guru

/** One subscriber on the Guru's list. */
export type Subscriber = {
  profileId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  birthYear: number | null;
  minor: boolean;
  joinedAt: string;
  parentName: string | null;
  parentEmail: string | null;
  parentRelation: string | null;
  parentConfirmedAt: string | null;
  blockedAt: string | null;
  blockReason: string | null;
  /** The login has since become a student (or staff): it reads as such, not as a subscriber. */
  inClass: boolean;
  memorised: number;
  notes: number;
};

type SubscriberRow = {
  profile_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  birth_year: number | null;
  minor: boolean;
  joined_at: string;
  parent_name: string | null;
  parent_email: string | null;
  parent_relation: string | null;
  parent_confirmed_at: string | null;
  blocked_at: string | null;
  block_reason: string | null;
  in_class: boolean;
  memorised: number;
  notes: number;
};

/** Joins in one week (Monday, India time). */
export type WeekJoins = { weekStart: string; joins: number };

/** I15: the list (newest first) and the joins of the last 12 weeks; null when it could not load. */
export async function fetchSubscribers(): Promise<{ subscribers: Subscriber[]; weeks: WeekJoins[] } | null> {
  const [list, weeks] = await Promise.all([
    supabase.rpc('ig_subscriber_list'),
    supabase.rpc('ig_subscriber_weeks', { p_weeks: 12 }),
  ]);
  if (list.error || weeks.error) return null;
  return {
    subscribers: (list.data as SubscriberRow[]).map((r) => ({
      profileId: r.profile_id,
      fullName: r.full_name,
      email: r.email,
      phone: r.phone,
      birthYear: r.birth_year,
      minor: r.minor,
      joinedAt: r.joined_at,
      parentName: r.parent_name,
      parentEmail: r.parent_email,
      parentRelation: r.parent_relation,
      parentConfirmedAt: r.parent_confirmed_at,
      blockedAt: r.blocked_at,
      blockReason: r.block_reason,
      inClass: r.in_class,
      memorised: r.memorised,
      notes: r.notes,
    })),
    weeks: (weeks.data as { week_start: string; joins: number }[]).map((w) => ({ weekStart: w.week_start, joins: w.joins })),
  };
}

/** I15: blocks (with an optional reason) or unblocks a subscriber. */
export async function setSubscriberBlocked(profileId: string, blocked: boolean, reason = ''): Promise<MessageKey | null> {
  const { error } = await supabase.rpc('ig_block_subscriber', {
    p_profile: profileId,
    p_blocked: blocked,
    p_reason: reason.trim() || null,
  });
  return error ? errorKeyOf(error.message) : null;
}

/** Database error codes that have their own message (ishtagoshtiJoin.errors.*). */
const KNOWN_ERRORS = [
  'not_pending',
  'email_not_confirmed',
  'blocked',
  'already_joined',
  'age_change_not_allowed',
  'birth_year_invalid',
  'phone_invalid',
  'terms_required',
  'parent_name_invalid',
  'parent_email_invalid',
  'parent_email_own',
  'parent_relation_invalid',
  'not_awaiting_parent',
  'code_too_soon',
  'code_limit',
  'code_daily_cap',
  'not_subscriber',
  'not_allowed',
  'not_found',
  'reason_too_long',
] as const;

function errorKeyOf(message: string | undefined): MessageKey {
  if (!message) return 'common.genericError';
  if (isNetworkError(message)) return 'common.networkError';
  const code = (KNOWN_ERRORS as readonly string[]).find((c) => message === c);
  if (code) return `ishtagoshtiJoin.errors.${code as (typeof KNOWN_ERRORS)[number]}`;
  if (/row-level security|permission denied/i.test(message)) return 'ishtagoshtiJoin.errors.not_allowed';
  return 'common.genericError';
}
