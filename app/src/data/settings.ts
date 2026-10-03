// Class settings (screen G10, the Guru only), and the one setting other screens read here: what
// "this week" means. Only settings the database really uses are offered (docs/DECISIONS.md #47):
//   centres.opens_at / closes_at   the open window; at 21:00 IST visits still open are closed at
//                                  the closing time (close_open_visits)
//   week_starts                    "this week" from Monday, or the last 7 days (week_start_ist)
//   irregular_days, inactive_days  days without a visit before Irregular / Inactive (daily job)
//   call_due_days, retry_days,     when a call is due, when to try again, tries before the Guru
//   max_retries                    is asked (daily job, log_call)
//   new_joiner_weeks               how long someone counts as a new joiner (home screens)
//   promotion_*                    promotion criteria (Phase 2, same keys as the branch
//                                  phase2-promotion); nothing on main reads them yet
// Saved together by save_settings (migration 0014), which checks every value and keeps Irregular
// before Inactive; every change goes to the audit log.

import type { ParseKeys } from 'i18next';

import { parseTimeOfDay } from '@/lib/dates';
import { supabase } from '@/lib/supabase';

import { isNetworkError } from './errors';

type MessageKey = ParseKeys;

/** What "this week" means on the home screens. */
export type WeekStarts = 'monday' | 'rolling7';

/** The whole-number settings with the range the database accepts. */
export const NUMBER_SETTINGS = {
  irregular_days: { min: 3, max: 90 },
  inactive_days: { min: 7, max: 365 },
  call_due_days: { min: 1, max: 14 },
  retry_days: { min: 1, max: 14 },
  max_retries: { min: 1, max: 10 },
  new_joiner_weeks: { min: 1, max: 12 },
  promotion_syllabus_percent: { min: 0, max: 100 },
  promotion_min_visits: { min: 0, max: 100 },
  promotion_visit_weeks: { min: 1, max: 52 },
  promotion_min_feedback: { min: 1, max: 10 },
} as const;
export type NumberSetting = keyof typeof NUMBER_SETTINGS;

/** The yes/no settings (Phase 2 promotion). */
export const FLAG_SETTINGS = ['promotion_needs_level_up'] as const;
export type FlagSetting = (typeof FLAG_SETTINGS)[number];

/** Everything G10 edits, as the form holds it (numbers and times as typed). */
export type SettingsForm = {
  weekStarts: WeekStarts;
  numbers: Record<NumberSetting, string>;
  flags: Record<FlagSetting, boolean>;
  /** The centre whose window is shown (Abids, the only one in Phase 1). */
  centreId: number | null;
  centreName: string;
  opensAt: string;
  closesAt: string;
  /** The window as loaded, so an unchanged window is not written again (and not logged). */
  savedWindow: string;
};

type SettingRow = { key: string; value: unknown };

/** Loads the settings and the first active centre. Null = could not load. */
export async function fetchSettings(): Promise<SettingsForm | null> {
  const [settings, centres] = await Promise.all([
    supabase.from('settings').select('key, value'),
    supabase.from('centres').select('id, name, opens_at, closes_at').eq('active', true).order('id').limit(1),
  ]);
  if (settings.error || centres.error) return null;
  const byKey = new Map((settings.data as SettingRow[]).map((r) => [r.key, r.value]));
  const numbers = {} as Record<NumberSetting, string>;
  for (const key of Object.keys(NUMBER_SETTINGS) as NumberSetting[]) {
    const value = byKey.get(key);
    numbers[key] = typeof value === 'number' ? String(value) : '';
  }
  const flags = {} as Record<FlagSetting, boolean>;
  for (const key of FLAG_SETTINGS) flags[key] = byKey.get(key) === true;
  const centre = (centres.data as { id: number; name: string; opens_at: string; closes_at: string }[])[0];
  return {
    weekStarts: byKey.get('week_starts') === 'rolling7' ? 'rolling7' : 'monday',
    numbers,
    flags,
    centreId: centre?.id ?? null,
    centreName: centre?.name ?? '',
    opensAt: centre ? centre.opens_at.slice(0, 5) : '',
    closesAt: centre ? centre.closes_at.slice(0, 5) : '',
    savedWindow: centre ? `-` : '',
  };
}

/** What "this week" means now; Monday when it cannot be read (the meaning before 0014). */
export async function fetchWeekStarts(): Promise<WeekStarts> {
  const { data } = await supabase.from('settings').select('value').eq('key', 'week_starts').maybeSingle();
  return (data as { value: unknown } | null)?.value === 'rolling7' ? 'rolling7' : 'monday';
}

/** Problems with fields of the form, as message keys. */
export type SettingsErrors = Partial<Record<NumberSetting | 'opensAt' | 'closesAt', MessageKey>>;

/** Checks the form as the database will. */
export function checkSettings(form: SettingsForm): SettingsErrors {
  const errors: SettingsErrors = {};
  for (const key of Object.keys(NUMBER_SETTINGS) as NumberSetting[]) {
    const { min, max } = NUMBER_SETTINGS[key];
    const text = form.numbers[key].trim();
    const n = Number(text);
    if (!/^\d+$/.test(text) || n < min || n > max) errors[key] = 'settings.errors.range';
  }
  if (!errors.irregular_days && !errors.inactive_days && Number(form.numbers.irregular_days) >= Number(form.numbers.inactive_days)) {
    errors.inactive_days = 'settings.errors.inactiveAfter';
  }
  if (form.centreId !== null) {
    const opens = parseTimeOfDay(form.opensAt);
    const closes = parseTimeOfDay(form.closesAt);
    if (!opens) errors.opensAt = 'settings.errors.time';
    if (!closes) errors.closesAt = 'settings.errors.time';
    if (opens && closes && opens >= closes) errors.closesAt = 'settings.errors.window';
  }
  return errors;
}

/** Saves the settings (all or nothing) and then the centre's window. */
export async function saveSettings(form: SettingsForm): Promise<{ errorKey?: MessageKey }> {
  const values: Record<string, unknown> = { week_starts: form.weekStarts };
  for (const key of Object.keys(NUMBER_SETTINGS) as NumberSetting[]) values[key] = Number(form.numbers[key]);
  for (const key of FLAG_SETTINGS) values[key] = form.flags[key];
  const { error } = await supabase.rpc('save_settings', { p_values: values });
  if (error) return { errorKey: errorKeyOf(error.message) };
  const opensAt = parseTimeOfDay(form.opensAt);
  const closesAt = parseTimeOfDay(form.closesAt);
  if (form.centreId !== null && `-` !== form.savedWindow) {
    const { error: centreError } = await supabase
      .from('centres')
      .update({ opens_at: opensAt, closes_at: closesAt })
      .eq('id', form.centreId);
    if (centreError) return { errorKey: errorKeyOf(centreError.message) };
  }
  return {};
}

function errorKeyOf(message: string): MessageKey {
  switch (message) {
    case 'not_allowed':
      return 'settings.errors.notAllowed';
    case 'irregular_after_inactive':
      return 'settings.errors.inactiveAfter';
    case 'window_invalid':
      return 'settings.errors.window';
    case 'setting_invalid':
    case 'setting_unknown':
      return 'settings.errors.range';
  }
  if (isNetworkError(message)) return 'common.networkError';
  return 'common.genericError';
}
