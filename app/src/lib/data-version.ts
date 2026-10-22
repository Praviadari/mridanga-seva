// "Has anything been saved since?" for the few lists the app keeps for a minute (audit phase 4 P5-05,
// docs/DECISIONS.md #330). Every call to Supabase passes noteRequest (src/lib/supabase.ts); a call that may
// change data moves the version on, and a kept list whose version is older is loaded again. Reads (GET, HEAD)
// and the database functions known only to read leave it alone. Any other database function counts as a write:
// a new reading function that is not in the list only costs a reload, never a stale screen.

/** Database functions that only read (POST /rest/v1/rpc/<name>): names starting get_, search_, is_, my_, or these. */
const READ_ONLY_FUNCTIONS = new Set([
  'class_report',
  'coordinator_dashboard',
  'event_counts',
  'event_people_list',
  'event_student_list',
  'guardian_notice_status',
  'guru_dashboard',
  'heard_about_report',
  'ig_my_state',
  'ig_sloka_of_day',
  'ig_subscriber_list',
  'ig_subscriber_weeks',
  'inbox_unread_count',
  'poll_state',
  'poll_voters',
  'practice_weeks',
  'promotion_criteria',
  'promotion_home',
  'promotion_ready_students',
  'sign_up_choices',
  'staff_names',
  'student_home',
  'syllabus_item_counts',
  'waiting_sign_ups',
]);

function readsOnly(fn: string): boolean {
  return /^(get|search|is|my)_/.test(fn) || READ_ONLY_FUNCTIONS.has(fn);
}

let version = 0;

/** The current version; it grows with every call that may have changed data. */
export function dataVersion(): number {
  return version;
}

/**
 * Called for every call the Supabase client makes.
 * @param address the call's web address.
 * @param method the HTTP method in capitals.
 * @returns whether the call counted as a write.
 */
export function noteRequest(address: string, method: string): boolean {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return false;
  // Signing in and refreshing the login change no class data.
  if (address.includes('/auth/v1/')) return false;
  const rpc = /\/rest\/v1\/rpc\/([a-z0-9_]+)/i.exec(address);
  if (rpc && readsOnly(rpc[1])) return false;
  version += 1;
  return true;
}

/** How long a kept list counts as fresh when nothing was saved meanwhile, in milliseconds. */
export const KEEP_MS = 60_000;

/**
 * One list kept for a minute for one signed-in person: `get` answers it while it is fresh (younger than
 * KEEP_MS, same person, nothing saved since), else null; `put` keeps a new answer; `forget` drops it.
 */
export function keptList<T>() {
  let kept: { at: number; version: number; owner: string; rows: T } | null = null;
  return {
    get(owner: string, now = Date.now()): T | null {
      if (!kept || kept.owner !== owner || kept.version !== version || now - kept.at >= KEEP_MS) return null;
      return kept.rows;
    },
    put(owner: string, rows: T, now = Date.now(), at = version): void {
      kept = { at: now, version: at, owner, rows };
    },
    forget(): void {
      kept = null;
    },
  };
}
