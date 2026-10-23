// The weekly email to a minor's parent (migration 0058, docs/DECISIONS.md #530-#539), as staff see it: per
// guardian on the student's page whether it goes and if not why, the parent's written yes (record or withdraw),
// "Send again"; on the screen "Weekly email to parents" the Guru's switch, the overview and a preview of exactly
// what a parent gets (built by the Edge Function notify-parents with the same code that sends it). Staff only:
// every function refuses everyone else. No names or emails come back here: the profile has those (logged).

import type { Language } from '@/i18n';
import { PRIVACY_NOTICE_VERSION } from '@/lib/privacy-notice';
import { supabase } from '@/lib/supabase';

import { fallbackErrorKey, type MessageKey } from './errors';

/** Why a guardian gets no weekly email now; null = they do. */
export type DigestBlock =
  | 'switched_off'
  | 'not_eligible'
  | 'withdrawn'
  | 'not_active'
  | 'adult'
  | 'no_consent'
  | 'no_email'
  | 'no_digest_consent';

const BLOCKS: readonly DigestBlock[] = ['switched_off', 'not_eligible', 'withdrawn', 'not_active', 'adult', 'no_consent', 'no_email', 'no_digest_consent'];

/** A block as the app knows it; an unknown one (a newer database) reads as not_eligible. */
export function digestBlockOf(value: string | null): DigestBlock | null {
  if (value === null) return null;
  return BLOCKS.includes(value as DigestBlock) ? (value as DigestBlock) : 'not_eligible';
}

export type GuardianDigest = {
  guardianId: string;
  block: DigestBlock | null;
  /** When the parent's yes was recorded (ISO), or null: none. */
  consentAt: string | null;
  /** ISO timestamp of the last weekly email sent, or null. */
  lastSentAt: string | null;
  /** What became of the latest one (sent, skipped, expired, …), or null. */
  lastOutcome: string | null;
};

/**
 * The weekly-email state of each guardian of the student, by guardian id. 'missing' = the database has no weekly
 * email yet (before 0058: the lines stay hidden); null = could not load.
 */
export async function fetchGuardianDigests(studentId: string): Promise<Map<string, GuardianDigest> | 'missing' | null> {
  const { data, error } = await supabase.rpc('guardian_digest_status', { p_student: studentId });
  if (error) return error.code === 'PGRST202' ? 'missing' : null;
  const rows = (data ?? []) as {
    guardian_id: string;
    block: string | null;
    consent_at: string | null;
    last_sent_at: string | null;
    last_outcome: string | null;
  }[];
  return new Map(
    rows.map((r) => [
      r.guardian_id,
      { guardianId: r.guardian_id, block: digestBlockOf(r.block), consentAt: r.consent_at, lastSentAt: r.last_sent_at, lastOutcome: r.last_outcome },
    ]),
  );
}

/** The database's refusals as messages. */
export function digestErrorKey(message: string): MessageKey {
  switch (message) {
    case 'not_allowed':
      return 'parentNotices.notAllowed';
    case 'no_email':
      return 'parentDigest.errors.noEmail';
    case 'not_a_minor':
      return 'parentDigest.errors.notMinor';
    case 'student_withdrawn':
      return 'common.studentWithdrawn';
    case 'data_consent_required':
      return 'parentDigest.errors.noDataConsent';
    case 'digest_blocked':
      return 'parentDigest.errors.blocked';
    case 'digest_again_too_soon':
      return 'parentDigest.errors.againTooSoon';
  }
  return fallbackErrorKey(message);
}

/**
 * Records the parent's written yes to the weekly email (form line D signed), or withdraws it when the parent
 * says stop. Returns an error message key, or nothing when saved.
 */
export async function saveGuardianDigest(guardianId: string, on: boolean): Promise<MessageKey | undefined> {
  const { error } = await supabase.rpc('set_guardian_digest', {
    p_guardian: guardianId,
    p_on: on,
    p_notice_version: on ? PRIVACY_NOTICE_VERSION : null,
  });
  return error ? digestErrorKey(error.message) : undefined;
}

/** "Send again": the latest week's email once more to this parent. Returns an error message key, or nothing. */
export async function resendGuardianDigest(guardianId: string): Promise<MessageKey | undefined> {
  const { error } = await supabase.rpc('resend_parent_digest', { p_guardian: guardianId });
  return error ? digestErrorKey(error.message) : undefined;
}

/** The weekly email at a glance (parent_digest_overview). */
export type DigestOverview = {
  enabled: boolean;
  limits: { per_run: number; digest_day: number; app_day: number; send_from: string; send_until: string; expire_hours: number };
  /** Monday of the week the latest email covers, and of this week. */
  lastWeek: string;
  thisWeek: string;
  /** Parent addresses by why they get none ('gets_it' = they get it, as if switched on). */
  parents: Record<string, number>;
  /** The latest week's emails by outcome ('waiting' = not done yet). */
  weekRows: Record<string, number>;
  digestsToday: number;
  appMailsToday: number;
  jobAt: string | null;
  jobResult: string | null;
};

type OverviewRow = {
  enabled: boolean;
  limits: DigestOverview['limits'];
  last_week: string;
  this_week: string;
  parents: Record<string, number> | null;
  week_rows: Record<string, number> | null;
  digests_today: number;
  app_mails_today: number;
  job_at: string | null;
  job_result: string | null;
};

function overviewOf(row: OverviewRow): DigestOverview {
  return {
    enabled: row.enabled === true,
    limits: row.limits,
    lastWeek: row.last_week,
    thisWeek: row.this_week,
    parents: row.parents ?? {},
    weekRows: row.week_rows ?? {},
    digestsToday: row.digests_today ?? 0,
    appMailsToday: row.app_mails_today ?? 0,
    jobAt: row.job_at,
    jobResult: row.job_result,
  };
}

/** The overview; 'missing' before 0058, null = could not load. */
export async function fetchDigestOverview(): Promise<DigestOverview | 'missing' | null> {
  const { data, error } = await supabase.rpc('parent_digest_overview');
  if (error) return error.code === 'PGRST202' ? 'missing' : null;
  return data ? overviewOf(data as OverviewRow) : null;
}

/** The Guru switches the weekly email on or off (audit log). Returns the new overview, or an error message key. */
export async function switchDigest(on: boolean): Promise<{ overview: DigestOverview } | { errorKey: MessageKey }> {
  const { data, error } = await supabase.rpc('set_parent_digest', { p_on: on });
  if (error) return { errorKey: error.message === 'not_allowed' ? 'admin.guruOnly' : fallbackErrorKey(error.message) };
  return { overview: overviewOf(data as OverviewRow) };
}

/** One email as a parent gets it. */
export type DigestEmail = { subject: string; text: string };

export type DigestPreview = {
  enabled: boolean;
  /** Per guardian: why none goes (null = it goes) and the language it goes in. */
  guardians: { guardianId: string; block: DigestBlock | null; language: Language }[];
  emails: Partial<Record<Language, DigestEmail>>;
};

/**
 * What a parent of this student gets for this week so far, built by notify-parents (the same code that sends it),
 * in `language`, or in each guardian's language when null. An error key when it cannot be built: the function
 * is not updated yet (deploy), the person is not staff, or no network.
 */
export async function fetchDigestPreview(studentId: string, language: Language | null): Promise<DigestPreview | { errorKey: MessageKey }> {
  const { data, error } = await supabase.functions.invoke('notify-parents', { body: { preview: studentId, ...(language ? { language } : {}) } });
  if (error || !data || typeof data !== 'object' || !('emails' in data)) return { errorKey: 'parentDigest.previewFailed' };
  const row = data as {
    enabled: boolean;
    guardians: { guardian_id: string; block: string | null; language: Language }[];
    emails: Partial<Record<Language, { subject: string; text: string }>>;
  };
  return {
    enabled: row.enabled === true,
    guardians: (row.guardians ?? []).map((g) => ({ guardianId: g.guardian_id, block: digestBlockOf(g.block), language: g.language })),
    emails: row.emails ?? {},
  };
}
