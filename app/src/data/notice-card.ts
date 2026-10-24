// The privacy-notice card on the homes (migration 0060, docs/DECISIONS.md #577): when the notice's version changes
// (PRIVACY_NOTICE_VERSION), the database says what to ask the signed-in person, and keeps their answer per version.

import { PRIVACY_NOTICE_VERSION } from '@/lib/privacy-notice';
import { supabase } from '@/lib/supabase';

/**
 * accept: an adult (a student of 18 or over, staff) reads the notice and agrees. adult_now: a student registered as a
 * child who is 18 now gives their own consent. show: a child shows the notice to the parent.
 */
export type NoticeAsk = 'accept' | 'adult_now' | 'show';

/** What to ask for this version, or null: nothing to ask, a database before 0060 (PGRST202), or no answer (offline). */
export async function fetchNoticeAsk(): Promise<NoticeAsk | null> {
  const { data, error } = await supabase.rpc('privacy_notice_ask', { p_version: PRIVACY_NOTICE_VERSION });
  if (error) return null;
  return data === 'accept' || data === 'adult_now' || data === 'show' ? data : null;
}

/** Records the answer (agreed, or shown to the parent) for this version. False when it could not be saved. */
export async function answerNotice(): Promise<boolean> {
  const { error } = await supabase.rpc('accept_privacy_notice', { p_version: PRIVACY_NOTICE_VERSION });
  return !error;
}
