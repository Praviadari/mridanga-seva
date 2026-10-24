// The client error log (migration 0061, docs/DECISIONS.md #585-#587): sending one report (src/lib/error-report.ts
// decides what and when) and the Guru's list on App errors. Nothing personal is sent or kept: the kind, the error's
// name, the screen's route pattern, the app version and the platform; the database adds staff / student / other.

import { supabase } from '@/lib/supabase';

/** What one report holds. */
export type ErrorReport = {
  kind: 'crash' | 'unhandled';
  errorName: string;
  screen: string;
  version: string;
  platform: 'android' | 'ios' | 'web';
};

/** Sends one report; true when the server took it (kept, counted or quietly dropped over a limit). Never throws. */
export async function sendErrorReport(report: ErrorReport): Promise<boolean> {
  try {
    const { error } = await supabase.rpc('log_client_error', {
      p_kind: report.kind,
      p_error: report.errorName,
      p_screen: report.screen,
      p_version: report.version,
      p_platform: report.platform,
    });
    return !error;
  } catch {
    return false;
  }
}

/** One line of App errors: the same error on the same screen and version within one hour, counted. */
export type AppErrorRow = {
  id: number;
  kind: 'crash' | 'unhandled';
  errorName: string;
  screen: string;
  version: string;
  platform: string;
  area: 'staff' | 'student' | 'other';
  times: number;
  firstAt: string;
  lastAt: string;
};

/** At most this many lines on App errors, newest first. */
export const APP_ERRORS_SHOWN = 200;

/** The newest error lines (the Guru; others get none); 'missing' before migration 0061, null when they could not load. */
export async function fetchAppErrors(): Promise<AppErrorRow[] | 'missing' | null> {
  const { data, error } = await supabase
    .from('client_errors')
    .select('id, kind, error_name, screen, app_version, platform, area, times, first_at, last_at')
    .order('last_at', { ascending: false })
    .limit(APP_ERRORS_SHOWN);
  if (error) return error.code === 'PGRST205' || error.code === '42P01' ? 'missing' : null;
  return (data ?? []).map((r) => ({
    id: r.id,
    kind: r.kind,
    errorName: r.error_name,
    screen: r.screen,
    version: r.app_version,
    platform: r.platform,
    area: r.area,
    times: r.times,
    firstAt: r.first_at,
    lastAt: r.last_at,
  }));
}
