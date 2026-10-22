// Importing the existing student list from Excel or CSV (screen G3, the Guru only).
//
// Steps: pick a file → its first sheet is read (src/lib/sheet-reader.ts) → the columns are
// matched to the app's fields by their headings (the Guru can change the match) → every row is
// checked here and shown with its problems → only the good rows are sent to import_students
// (supabase/migrations/0014_guru_admin.sql), which checks them again and gives each saved row its
// roll number. Adults only: under-18s need the parent's consent form (C2). docs/DECISIONS.md #46.
// Since 0054 (#326, audit R3-04, R3-07, R2-13): each import has an id, sent with every row, so the Guru can
// undo it (undo_import: the records nothing hangs on are deleted); rows not sent are counted, not lost.

import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

import { ageOn, parseDayMonthYear, todayLocal } from '@/lib/dates';
import { checkPersonName, cleanName } from '@/lib/person-name';
import { MAX_SHEET_BYTES, readSheet, type SheetError, type SheetRows } from '@/lib/sheet-reader';
import { supabase } from '@/lib/supabase';
import { readAllRows } from '@/lib/paged-read';

import { isNetworkError, type MessageKey } from './errors';

// ---------------------------------------------------------------- fields and columns

/** The app's fields a column can fill, in the order the mapping shows them. */
export const IMPORT_FIELDS = ['fullName', 'dob', 'phone', 'email', 'area', 'pincode', 'level', 'joinedOn', 'rollNo'] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

/** Fields every row needs. */
export const REQUIRED_FIELDS: readonly ImportField[] = ['fullName', 'dob'];

/** Which column (0-based) fills each field; a field without a column is left out. */
export type ColumnMap = Partial<Record<ImportField, number>>;

/** Headings that mean each field, compared in lower case without dots, dashes or extra spaces. */
const HEADINGS: Record<ImportField, string[]> = {
  fullName: ['name', 'full name', 'student name', 'student', 'name of the student', 'devotee name'],
  dob: ['dob', 'date of birth', 'birth date', 'birthdate', 'birthday', 'born'],
  phone: ['phone', 'mobile', 'mobile number', 'mobile no', 'phone number', 'phone no', 'contact', 'contact number', 'whatsapp', 'whatsapp number', 'cell'],
  email: ['email', 'e mail', 'email id', 'mail', 'mail id', 'email address'],
  area: ['area', 'locality', 'location', 'place', 'colony'],
  pincode: ['pincode', 'pin', 'pin code', 'postal code', 'zip', 'zip code'],
  level: ['level', 'class', 'grade', 'stage'],
  joinedOn: ['joined', 'joined on', 'joining date', 'date of joining', 'doj', 'join date', 'start date', 'since'],
  // Not "S.No" or "Number": in most lists that is a row count, not a student's number.
  rollNo: ['roll', 'roll no', 'roll number', 'student id', 'reg no', 'registration number', 'registration no'],
};

function normaliseHeading(text: string): string {
  return text.toLowerCase().replace(/[._\-:#()]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Matches columns to fields by their headings; each column fills at most one field. */
export function guessColumns(headings: readonly string[]): ColumnMap {
  const map: ColumnMap = {};
  const used = new Set<number>();
  for (const field of IMPORT_FIELDS) {
    const index = headings.findIndex((h, i) => !used.has(i) && HEADINGS[field].includes(normaliseHeading(h)));
    if (index >= 0) {
      map[field] = index;
      used.add(index);
    }
  }
  return map;
}

// ---------------------------------------------------------------- reading cell values

/**
 * A date from a cell: Excel's day number (an .xlsx keeps dates as days since 30-12-1899),
 * day-month-year (15-06-2012, 15/06/2012, 15.06.2012), year-month-day, or 15-Jun-2012.
 * Returns 'YYYY-MM-DD', or null when it is not a date.
 */
export function parseImportDate(text: string): string | null {
  const value = text.trim();
  if (/^\d{4,5}(\.\d+)?$/.test(value)) {
    const days = Math.floor(Number(value));
    if (days < 1 || days > 80000) return null;
    return new Date(Date.UTC(1899, 11, 30) + days * 86400000).toISOString().slice(0, 10);
  }
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(value);
  if (iso) return parseDayMonthYear(`${iso[3]}-${iso[2]}-${iso[1]}`);
  const named = /^(\d{1,2})[-/. ]([A-Za-z]{3,9})[-/. ,]+(\d{4})$/.exec(value);
  if (named) {
    const month = MONTHS.indexOf(named[2].slice(0, 3).toLowerCase()) + 1;
    return month > 0 ? parseDayMonthYear(`${named[1]}-${month}-${named[3]}`) : null;
  }
  return parseDayMonthYear(value);
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** A level from a cell: 1-3, or the start of Beginner / Intermediate / Advanced. Empty = Beginner. */
export function parseLevel(text: string): number | null {
  const value = text.trim().toLowerCase();
  if (value === '') return 1;
  if (/^[123]$/.test(value)) return Number(value);
  if ('beginner'.startsWith(value) || value.startsWith('begin') || value === 'basic') return 1;
  if ('intermediate'.startsWith(value) || value.startsWith('inter')) return 2;
  if ('advanced'.startsWith(value) || value.startsWith('advance')) return 3;
  return null;
}

/** Phone as stored by C2: spaces and dashes removed. A number Excel turned into 9.8E+09 is refused. */
function cleanImportPhone(text: string): string {
  return text.replace(/[\s-]/g, '');
}

/** The last 10 digits of a phone, to find the same number written with or without +91. */
function phoneKey(phone: string): string {
  return phone.replace(/\D/g, '').slice(-10);
}

// ---------------------------------------------------------------- checking rows

/** What a row will save, already cleaned. */
export type ImportValues = {
  fullName: string;
  dob: string | null;
  phone: string;
  email: string;
  area: string;
  pincode: string;
  levelId: number | null;
  joinedOn: string | null;
  rollNo: string;
};

/** Problems a row can have; each has a message importErrors.<code>. */
export const ROW_PROBLEMS = [
  'name_required',
  'name_too_long',
  'name_digits',
  'name_too_short',
  'name_signs',
  'dob_required',
  'dob_invalid',
  'minor_use_form',
  'joined_invalid',
  'phone_invalid',
  'duplicate_phone',
  'email_invalid',
  'duplicate_email',
  'pincode_invalid',
  'level_invalid',
  'duplicate_student',
  'duplicate_roll',
  'row_failed',
] as const;
export type RowProblem = (typeof ROW_PROBLEMS)[number];

/** One data row of the file with what it would save and its problems (none = good). */
export type PreviewRow = { line: number; values: ImportValues; problems: RowProblem[] };

/** What is already in the database, to find rows that would be duplicates. */
export type ExistingStudents = { phones: Set<string>; emails: Set<string>; nameDob: Set<string>; rolls: Set<string> };

const nameDobKey = (name: string, dob: string) => `${name.toLowerCase()}|${dob}`;

/** Loads phones, emails, names with dates of birth and roll numbers of the students already saved (all of them, #325). */
export async function fetchExistingStudents(): Promise<ExistingStudents | null> {
  const { data, error } = await readAllRows((from, to) =>
    supabase.from('students').select('full_name, dob, phone, email, roll_no').order('id').range(from, to),
  );
  if (error || !data) return null;
  const rows = data as { full_name: string; dob: string | null; phone: string | null; email: string | null; roll_no: string }[];
  return {
    phones: new Set(rows.filter((r) => r.phone).map((r) => phoneKey(r.phone ?? ''))),
    emails: new Set(rows.filter((r) => r.email).map((r) => (r.email ?? '').toLowerCase())),
    nameDob: new Set(rows.filter((r) => r.dob).map((r) => nameDobKey(r.full_name, r.dob ?? ''))),
    rolls: new Set(rows.map((r) => r.roll_no.toLowerCase())),
  };
}

/**
 * Checks every data row (all rows after the heading row) with the column match. `today` is
 * 'YYYY-MM-DD' at the class. The database checks the same again; it also refuses a duplicate that
 * appears while the import runs.
 */
export function checkRows(rows: SheetRows, columns: ColumnMap, existing: ExistingStudents, today: string): PreviewRow[] {
  const cell = (row: string[], field: ImportField) => {
    const index = columns[field];
    return index === undefined ? '' : (row[index] ?? '').trim();
  };
  const seenPhones = new Set<string>();
  const seenEmails = new Set<string>();
  const seenNameDob = new Set<string>();
  const seenRolls = new Set<string>();
  const result: PreviewRow[] = [];
  rows.forEach((row, index) => {
    if (index === 0 || row.every((c) => c.trim() === '')) return;
    const line = index + 1;
    const problems: RowProblem[] = [];
    const fullName = cleanName(cell(row, 'fullName'));
    const dobText = cell(row, 'dob');
    const dob = dobText ? parseImportDate(dobText) : null;
    const joinedText = cell(row, 'joinedOn');
    const joinedOn = joinedText ? parseImportDate(joinedText) : null;
    const phone = cleanImportPhone(cell(row, 'phone'));
    const email = cell(row, 'email');
    const pincode = cell(row, 'pincode').replace(/\.0$/, '');
    const levelId = parseLevel(cell(row, 'level'));
    const rollNo = cell(row, 'rollNo');

    // The same name rule as the forms (#267): letters of any script, no digits.
    const nameProblem = checkPersonName(fullName, { max: 100 });
    if (nameProblem === 'required') problems.push('name_required');
    else if (nameProblem === 'tooLong') problems.push('name_too_long');
    else if (nameProblem === 'digits') problems.push('name_digits');
    // One letter is too short, not a wrong sign (audit FF-02).
    else if (nameProblem === 'tooShort') problems.push('name_too_short');
    else if (nameProblem) problems.push('name_signs');
    if (!dobText) problems.push('dob_required');
    else if (!dob || dob > today || ageOn(dob, today) > 100) problems.push('dob_invalid');
    else if (ageOn(dob, today) < 18) problems.push('minor_use_form');
    if (joinedText && (!joinedOn || joinedOn > today || joinedOn < '2000-01-01' || (dob !== null && joinedOn < dob))) {
      problems.push('joined_invalid');
    }
    if (phone) {
      if (!/^\+?[0-9]{10,13}$/.test(phone)) problems.push('phone_invalid');
      else if (existing.phones.has(phoneKey(phone)) || seenPhones.has(phoneKey(phone))) problems.push('duplicate_phone');
    }
    if (email) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) problems.push('email_invalid');
      else if (existing.emails.has(email.toLowerCase()) || seenEmails.has(email.toLowerCase())) problems.push('duplicate_email');
    }
    if (pincode && !/^[0-9]{6}$/.test(pincode)) problems.push('pincode_invalid');
    if (levelId === null) problems.push('level_invalid');
    if (fullName && dob) {
      const key = nameDobKey(fullName, dob);
      if (existing.nameDob.has(key) || seenNameDob.has(key)) problems.push('duplicate_student');
      seenNameDob.add(key);
    }
    if (rollNo) {
      const key = rollNo.toLowerCase();
      if (existing.rolls.has(key) || seenRolls.has(key)) problems.push('duplicate_roll');
      seenRolls.add(key);
    }
    if (phone && /^\+?[0-9]{10,13}$/.test(phone)) seenPhones.add(phoneKey(phone));
    if (email) seenEmails.add(email.toLowerCase());

    result.push({
      line,
      values: { fullName, dob, phone, email, area: cell(row, 'area'), pincode, levelId, joinedOn, rollNo },
      problems,
    });
  });
  return result;
}

// ---------------------------------------------------------------- picking and importing

/** A file read into rows, or why it could not be read. */
export type PickedSheet = { fileName: string; rows: SheetRows } | { errorKey: MessageKey } | null;

/** Opens the file chooser for an Excel or CSV file and reads it. Null = cancelled. */
export async function pickSheet(): Promise<PickedSheet> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/csv',
        'text/comma-separated-values',
        'application/vnd.ms-excel',
        'text/plain',
      ],
      multiple: false,
      copyToCacheDirectory: true,
      base64: false,
    });
    if (result.canceled) return null;
    const asset = result.assets[0];
    if ((asset.size ?? 0) > MAX_SHEET_BYTES) return { errorKey: 'importErrors.file.too_big' };
    const bytes =
      Platform.OS === 'web'
        ? new Uint8Array(await (asset.file ?? (await (await fetch(asset.uri)).blob())).arrayBuffer())
        : new Uint8Array(await new File(asset.uri).arrayBuffer());
    const rows = readSheet(asset.name, bytes);
    if (typeof rows === 'string') return { errorKey: sheetErrorKey(rows) };
    return { fileName: asset.name, rows };
  } catch {
    return { errorKey: 'importErrors.file.not_a_sheet' };
  }
}

function sheetErrorKey(error: SheetError): MessageKey {
  return `importErrors.file.${error}`;
}

/** What happened to one row sent to the database. */
export type ImportResult = { line: number; rollNo?: string; problem?: RowProblem };

/** Rows sent per call; the database takes at most 500. */
const BATCH = 200;

/**
 * Sends the good rows to import_students, in batches, each row with the import's id (`importId`, #326).
 * Returns one result per row sent, or an error key when a batch could not be sent (the rows of earlier
 * batches are saved; the rest are not sent: Import the rest checks them again).
 */
export async function importRows(rows: readonly PreviewRow[], importId: string): Promise<{ results: ImportResult[]; errorKey?: MessageKey }> {
  const results: ImportResult[] = [];
  for (let start = 0; start < rows.length; start += BATCH) {
    const batch = rows.slice(start, start + BATCH).map(({ line, values }) => ({
      line,
      full_name: values.fullName,
      dob: values.dob,
      phone: values.phone || null,
      email: values.email || null,
      area: values.area || null,
      pincode: values.pincode || null,
      level_id: values.levelId ?? 1,
      joined_on: values.joinedOn,
      import_id: importId,
    }));
    const { data, error } = await supabase.rpc('import_students', { p_rows: batch });
    if (error) {
      return {
        results,
        errorKey: isNetworkError(error.message)
          ? 'common.networkError'
          : error.message === 'not_allowed'
            ? 'importErrors.notAllowed'
            : 'common.genericError',
      };
    }
    for (const r of data as { line: number; roll_no?: string; error?: string }[]) {
      results.push({
        line: r.line,
        rollNo: r.roll_no,
        problem: r.error ? ((ROW_PROBLEMS as readonly string[]).includes(r.error) ? (r.error as RowProblem) : 'row_failed') : undefined,
      });
    }
  }
  return { results };
}

/** An import that can still be undone: when it ran and how many of its records are left. */
export type RecentImport = { importId: string; at: string; count: number };

/** How long an import can be undone from the import screen, in days. */
export const UNDO_DAYS = 30;

/** The imports of the last UNDO_DAYS days that still have records, newest first. Null = could not be loaded. */
export async function fetchRecentImports(now = Date.now()): Promise<RecentImport[] | null> {
  const since = new Date(now - UNDO_DAYS * 86_400_000).toISOString();
  const { data, error } = await readAllRows((from, to) =>
    supabase
      .from('students')
      .select('import_id, created_at')
      .not('import_id', 'is', null)
      .gte('created_at', since)
      .order('id')
      .range(from, to),
  );
  if (error || !data) return null;
  return groupImports(data as { import_id: string; created_at: string }[]);
}

/** Records grouped by their import: the earliest record's time, the count; newest import first. */
export function groupImports(rows: readonly { import_id: string; created_at: string }[]): RecentImport[] {
  const byId = new Map<string, RecentImport>();
  for (const row of rows) {
    const seen = byId.get(row.import_id);
    if (!seen) byId.set(row.import_id, { importId: row.import_id, at: row.created_at, count: 1 });
    else {
      seen.count += 1;
      if (row.created_at < seen.at) seen.at = row.created_at;
    }
  }
  return [...byId.values()].sort((a, b) => b.at.localeCompare(a.at));
}

/** A record undo_import kept, and why (student_linked, student_visited, student_has_history, student_withdrawn). */
export type KeptRecord = { rollNo: string; fullName: string; reason: string };

/** Undoes an import (the Guru only, #326): deletes its records that nothing hangs on, lists the others. */
export async function undoImport(importId: string): Promise<{ deleted: number; kept: KeptRecord[] } | { errorKey: MessageKey }> {
  const { data, error } = await supabase.rpc('undo_import', { p_import: importId });
  if (error) {
    if (error.message === 'not_allowed') return { errorKey: 'importErrors.notAllowed' };
    if (error.message === 'import_not_found') return { errorKey: 'importStudents.undoNotFound' };
    return { errorKey: isNetworkError(error.message) ? 'common.networkError' : 'common.genericError' };
  }
  const result = data as { deleted: number; kept: { roll_no: string; full_name: string; reason: string }[] };
  return { deleted: result.deleted, kept: result.kept.map((k) => ({ rollNo: k.roll_no, fullName: k.full_name, reason: k.reason })) };
}

/** Today at the class, for checkRows. */
export const importToday = todayLocal;
