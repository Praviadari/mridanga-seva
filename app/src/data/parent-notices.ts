// Check-in / check-out emails to a minor's parent (migration 0043, docs/DECISIONS.md #224-#231), as
// staff see them on C8 Student profile: per guardian, whether the emails go and if not why, the
// language, when the last one went; and the switch a coordinator uses when a parent asks to stop
// or start them. Staff only (guardian_notice_status and set_guardian_notices refuse everyone else).
// No names or emails come back here: the profile has those from get_guardians (logged).

import type { Language } from '@/i18n';
import { supabase } from '@/lib/supabase';

import { fallbackErrorKey, type MessageKey } from './errors';

/** Why a guardian gets no email now; null = they do. */
export type NoticeBlock = 'switched_off' | 'not_eligible' | 'withdrawn' | 'adult' | 'no_consent' | 'no_email' | 'stopped';

export type GuardianNotice = {
  guardianId: string;
  block: NoticeBlock | null;
  /** null = the child's app language. */
  language: Language | null;
  /** ISO timestamp of the last email sent, or null. */
  lastSentAt: string | null;
};

const BLOCKS: readonly NoticeBlock[] = ['switched_off', 'not_eligible', 'withdrawn', 'adult', 'no_consent', 'no_email', 'stopped'];

/**
 * The notice state of each guardian of the student, by guardian id. 'missing' = the database has
 * no parent notices yet (before 0043: the panel stays hidden); null = could not load.
 */
export async function fetchGuardianNotices(studentId: string): Promise<Map<string, GuardianNotice> | 'missing' | null> {
  const { data, error } = await supabase.rpc('guardian_notice_status', { p_student: studentId });
  if (error) return error.code === 'PGRST202' ? 'missing' : null;
  const rows = (data ?? []) as { guardian_id: string; block: string | null; language: string | null; last_sent_at: string | null }[];
  return new Map(
    rows.map((r) => [
      r.guardian_id,
      {
        guardianId: r.guardian_id,
        block: BLOCKS.includes(r.block as NoticeBlock) ? (r.block as NoticeBlock) : r.block === null ? null : 'not_eligible',
        language: r.language === 'en' || r.language === 'te' || r.language === 'hi' ? r.language : null,
        lastSentAt: r.last_sent_at,
      },
    ]),
  );
}

/**
 * Emails on or off for one guardian, and their language (null = the child's app language).
 * Returns an error message key, or nothing when saved.
 */
export async function saveGuardianNotices(guardianId: string, on: boolean, language: Language | null): Promise<MessageKey | undefined> {
  const { error } = await supabase.rpc('set_guardian_notices', { p_guardian: guardianId, p_on: on, p_language: language ?? '' });
  if (!error) return undefined;
  return error.message === 'not_allowed' ? 'parentNotices.notAllowed' : fallbackErrorKey(error.message);
}
