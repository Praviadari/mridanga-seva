// The audit log (screen G11, the Guru only, read-only): who changed what and when, with the
// values before and after. Rows are written by database triggers (audit_row and friends, migrations
// 0001-0014) for students, profiles, call logs, level changes, syllabus items and ticks, materials,
// announcements, deleted replies, settings and centres. Row-level security lets only the Guru read
// them (policy guru_read, 0001). Read 50 at a time, newest first, filtered in the database.

import { supabase } from '@/lib/supabase';

/** Tables whose changes are logged, in the order the filter offers them. */
export const AUDITED_TABLES = [
  'students',
  'call_logs',
  'student_progress',
  'level_history',
  'profiles',
  'syllabus_items',
  'materials',
  'announcements',
  'announcement_replies',
  'settings',
  'centres',
] as const;
export type AuditedTable = (typeof AUDITED_TABLES)[number];

export type AuditAction = 'INSERT' | 'UPDATE' | 'DELETE';

/** One audit_log row. */
export type AuditEntry = {
  id: number;
  table: string;
  rowId: string;
  action: AuditAction;
  changedBy: string | null;
  changedAt: string;
  oldRow: Record<string, unknown> | null;
  newRow: Record<string, unknown> | null;
};

/** The filters; 'all' = none. `days` 0 = any time. */
export type AuditFilters = { table: AuditedTable | 'all'; person: string | 'all'; action: AuditAction | 'all'; days: 0 | 1 | 7 | 30 };
export const NO_AUDIT_FILTERS: AuditFilters = { table: 'all', person: 'all', action: 'all', days: 0 };

/** Rows per page. */
export const AUDIT_PAGE = 50;

/** Loads one page of the log, newest first, after `beforeId` (null = from the newest). Null = could not load. */
export async function fetchAuditPage(filters: AuditFilters, beforeId: number | null): Promise<AuditEntry[] | null> {
  let query = supabase
    .from('audit_log')
    .select('id, table_name, row_id, action, changed_by, changed_at, old_row, new_row')
    .order('id', { ascending: false })
    .limit(AUDIT_PAGE);
  if (beforeId !== null) query = query.lt('id', beforeId);
  if (filters.table !== 'all') query = query.eq('table_name', filters.table);
  if (filters.person !== 'all') query = query.eq('changed_by', filters.person);
  if (filters.action !== 'all') query = query.eq('action', filters.action);
  if (filters.days > 0) query = query.gte('changed_at', new Date(Date.now() - filters.days * 86400000).toISOString());
  const { data, error } = await query;
  if (error) return null;
  return (
    data as {
      id: number;
      table_name: string;
      row_id: string;
      action: AuditAction;
      changed_by: string | null;
      changed_at: string;
      old_row: Record<string, unknown> | null;
      new_row: Record<string, unknown> | null;
    }[]
  ).map((r) => ({
    id: r.id,
    table: r.table_name,
    rowId: r.row_id,
    action: r.action,
    changedBy: r.changed_by,
    changedAt: r.changed_at,
    oldRow: r.old_row,
    newRow: r.new_row,
  }));
}

/** Names to show: people (logins), students and syllabus items by id. */
export type AuditNames = { people: Map<string, string>; students: Map<string, string>; items: Map<string, string> };

/** Loads the names once for the whole log. Null = could not load. */
export async function fetchAuditNames(): Promise<AuditNames | null> {
  const [people, students, items] = await Promise.all([
    supabase.from('profiles').select('id, full_name, email'),
    supabase.from('students').select('id, full_name, roll_no'),
    supabase.from('syllabus_items').select('id, title'),
  ]);
  if (people.error || students.error || items.error) return null;
  return {
    people: new Map(
      (people.data as { id: string; full_name: string; email: string | null }[]).map((p) => [p.id, p.full_name || p.email || '']),
    ),
    students: new Map(
      (students.data as { id: string; full_name: string; roll_no: string }[]).map((s) => [s.id, `${s.full_name} (${s.roll_no})`]),
    ),
    items: new Map((items.data as { id: number; title: string }[]).map((i) => [String(i.id), i.title])),
  };
}

const text = (value: unknown) => (typeof value === 'string' || typeof value === 'number' ? String(value) : '');

/** A short name for the record a row is about: the student, the title, the setting ... */
export function subjectOf(entry: AuditEntry, names: AuditNames): string {
  const row = entry.newRow ?? entry.oldRow ?? {};
  const student = () => names.students.get(text(row.student_id)) ?? text(row.student_id);
  switch (entry.table) {
    case 'students':
      return [text(row.full_name), text(row.roll_no) && `(${text(row.roll_no)})`].filter(Boolean).join(' ');
    case 'profiles':
      return text(row.full_name) || text(row.email);
    case 'call_logs':
    case 'level_history':
      return student();
    case 'student_progress':
      return `${student()} · ${names.items.get(text(row.item_id)) ?? text(row.item_id)}`;
    case 'syllabus_items':
    case 'materials':
    case 'announcements':
      return text(row.title);
    case 'announcement_replies':
      return text(row.body).slice(0, 60);
    case 'settings':
      return text(row.key);
    case 'centres':
      return text(row.name);
  }
  return entry.rowId;
}

/** One changed value: the field and its value before and after ('' = none). */
export type FieldChange = { field: string; before: string; after: string };

/** Columns that change on their own or say nothing to a reader. */
const QUIET_FIELDS = new Set(['id', 'qr_token', 'created_at', 'notified_at']);

/** A value as short text: lists and objects as JSON, at most 160 characters. */
export function valueText(value: unknown): string {
  if (value === null || value === undefined) return '';
  const result = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return result.length > 160 ? `${result.slice(0, 157)}...` : result;
}

/** The fields an entry changed: for an edit the ones that differ, for an add or delete every filled one. */
export function changesOf(entry: AuditEntry): FieldChange[] {
  const before = entry.oldRow ?? {};
  const after = entry.newRow ?? {};
  const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return fields
    .filter((field) => !QUIET_FIELDS.has(field))
    .map((field) => ({ field, before: valueText(before[field]), after: valueText(after[field]) }))
    .filter((c) => c.before !== c.after);
}
