// The class fund ledger (Phase 2 slice 9, docs/DECISIONS.md #80). The fund is the Mridanga team's
// own; the app RECORDS money only (no payments). The Guru and treasurers (coordinators the Guru
// marked in G2) record income and expense entries; every coordinator reads the ledger; students
// see nothing. An expense over the approval limit (G10, Rs 2,000) waits for the Guru, or for a
// treasurer when the Guru made it, and counts only once approved; nobody approves their own. A
// bill photo or PDF is needed over the bill limit (Rs 500). Entries are never deleted or changed:
// a mistake is undone by a reversal (a counter-entry with the amount negative). The database
// checks all of it again (supabase/migrations/0026_fund.sql). Amounts are whole paise.

import type { ParseKeys, TFunction } from 'i18next';
import * as WebBrowser from 'expo-web-browser';

import { formatMoney } from '@/lib/money';
import { supabase } from '@/lib/supabase';

import { pickPdfs, pickPhotos, removeFiles, signedLinks, uploadFiles, type PickedFile, type PickResult } from './announcement-files';
import { fallbackErrorKey } from './errors';

/** The private Storage bucket of the bills (migration 0026). */
export const BILLS_BUCKET = 'fund-bills';
/** Largest bill, as for the materials: 10 MB. */
export const MAX_BILL_BYTES = 10 * 1024 * 1024;
/** Longest texts, as in the database. */
export const PARTY_MAX = 80;
export const REFERENCE_MAX = 60;
export const NOTE_MAX = 500;
export const CATEGORY_NAME_MAX = 40;

export type Direction = 'income' | 'expense';
export type EntryStatus = 'approved' | 'waiting' | 'declined' | 'withdrawn';

/** The built-in categories (0026), shown in the app's language. */
export const CATEGORY_CODES = ['donation', 'sponsorship', 'instruments', 'prasadam', 'events', 'travel', 'printing', 'other'] as const;
type CategoryCode = (typeof CATEGORY_CODES)[number];

export type FundCategory = {
  id: number;
  direction: Direction;
  code: string | null;
  name: string;
  sort: number;
  retired: boolean;
};

export type FundEntry = {
  id: number;
  direction: Direction;
  categoryId: number;
  /** YYYY-MM-DD. */
  onDate: string;
  /** As entered; negative on a reversal. */
  amountPaise: number;
  party: string | null;
  reference: string | null;
  note: string | null;
  billPath: string | null;
  billName: string | null;
  status: EntryStatus;
  /** On a reversal: the entry it undoes. */
  reversesId: number | null;
  /** The live (approved or waiting) reversal of this entry, if any. */
  reversedById: number | null;
  createdBy: string;
  createdByName: string;
  /** True when a Guru made it (then a treasurer approves it). */
  madeByGuru: boolean;
  createdAt: string;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  /** What it does to the balance: + income, - expense, 0 unless approved. */
  effectPaise: number;
  /** The balance after it (approved entries only, in date order). */
  balanceAfterPaise: number | null;
};

/** Everything the fund screens show. */
export type FundBook = {
  categories: FundCategory[];
  /** Newest first (date, then the order recorded). */
  entries: FundEntry[];
  balancePaise: number;
  /** The two limits (G10) in paise. */
  approvalLimitPaise: number;
  billLimitPaise: number;
  /** The Guru or a treasurer: may record and reverse. */
  isKeeper: boolean;
  isGuru: boolean;
  isTreasurer: boolean;
  myId: string | null;
};

type EntryRow = {
  id: number;
  direction: Direction;
  category_id: number;
  on_date: string;
  amount_paise: number | string;
  party: string | null;
  reference: string | null;
  note: string | null;
  bill_path: string | null;
  bill_name: string | null;
  status: EntryStatus;
  reverses_id: number | null;
  created_by: string;
  created_at: string;
  decided_at: string | null;
  decision_note: string | null;
  maker: { full_name: string; role: string } | null;
  decider: { full_name: string } | null;
};

const ENTRY_COLUMNS =
  'id, direction, category_id, on_date, amount_paise, party, reference, note, bill_path, bill_name, status, reverses_id, ' +
  'created_by, created_at, decided_at, decision_note, ' +
  'maker:profiles!fund_entries_created_by_fkey(full_name, role), decider:profiles!fund_entries_decided_by_fkey(full_name)';

/** Loads the categories, all entries with the running balance, the limits and who the signed-in person is. Null = could not load. */
export async function fetchFundBook(myId: string | null, isGuru: boolean): Promise<FundBook | null> {
  const [categories, entries, limits, treasurer] = await Promise.all([
    supabase.from('fund_categories').select('id, direction, code, name, sort, retired_at').order('direction').order('sort').order('name'),
    supabase.from('fund_entries').select(ENTRY_COLUMNS).order('on_date').order('id'),
    supabase.from('settings').select('key, value').in('key', ['fund_approval_rupees', 'fund_bill_rupees']),
    supabase.rpc('is_treasurer'),
  ]);
  if (categories.error || entries.error || limits.error) return null;
  const limit = (key: string) => {
    const value = (limits.data as { key: string; value: unknown }[]).find((r) => r.key === key)?.value;
    return typeof value === 'number' ? value * 100 : 0;
  };
  const rows = entries.data as unknown as EntryRow[];
  const liveReversal = new Map<number, number>();
  for (const row of rows) {
    if (row.reverses_id !== null && (row.status === 'approved' || row.status === 'waiting')) liveReversal.set(row.reverses_id, row.id);
  }
  let balance = 0;
  const list = rows.map((row): FundEntry => {
    const amount = Number(row.amount_paise);
    const effect = row.status === 'approved' ? (row.direction === 'income' ? amount : -amount) : 0;
    balance += effect;
    return {
      id: row.id,
      direction: row.direction,
      categoryId: row.category_id,
      onDate: row.on_date,
      amountPaise: amount,
      party: row.party,
      reference: row.reference,
      note: row.note,
      billPath: row.bill_path,
      billName: row.bill_name,
      status: row.status,
      reversesId: row.reverses_id,
      reversedById: liveReversal.get(row.id) ?? null,
      createdBy: row.created_by,
      createdByName: row.maker?.full_name ?? '',
      madeByGuru: row.maker?.role === 'guru',
      createdAt: row.created_at,
      decidedByName: row.decider?.full_name ?? null,
      decidedAt: row.decided_at,
      decisionNote: row.decision_note,
      effectPaise: effect,
      balanceAfterPaise: row.status === 'approved' ? balance : null,
    };
  });
  const isTreasurer = !treasurer.error && treasurer.data === true;
  return {
    categories: (
      categories.data as { id: number; direction: Direction; code: string | null; name: string; sort: number; retired_at: string | null }[]
    ).map((c) => ({ id: c.id, direction: c.direction, code: c.code, name: c.name, sort: c.sort, retired: c.retired_at !== null })),
    entries: list.reverse(),
    balancePaise: balance,
    approvalLimitPaise: limit('fund_approval_rupees'),
    billLimitPaise: limit('fund_bill_rupees'),
    isKeeper: isGuru || isTreasurer,
    isGuru,
    isTreasurer,
    myId,
  };
}

/** True when the signed-in person may approve or decline `entry`: never their own; the Guru, or a treasurer for the Guru's. */
export function canDecide(book: FundBook, entry: FundEntry): boolean {
  if (entry.status !== 'waiting' || !book.myId || entry.createdBy === book.myId) return false;
  return book.isGuru || (book.isTreasurer && entry.madeByGuru);
}

/** The entries waiting for the signed-in person's decision. */
export function waitingForMe(book: FundBook): FundEntry[] {
  return book.entries.filter((e) => canDecide(book, e));
}

/** A category's name in the app's language. */
export function categoryName(t: TFunction, category: FundCategory | undefined): string {
  if (!category) return '';
  return category.code && (CATEGORY_CODES as readonly string[]).includes(category.code)
    ? t(`fund.categories.${category.code as CategoryCode}`)
    : category.name;
}

// ---------------------------------------------------------------- money as text

/**
 * Paise as rupees with Indian grouping: 125050 → "₹1,250.50", 200000 → "₹2,000". `signed` adds + or -.
 * Every fund entry is in INR for now (fund_entries.currency, 0033): one fund, one currency until the
 * team decides how a fund abroad works (docs/I18N.md).
 */
export function formatRupees(paise: number, signed = false): string {
  return formatMoney(paise, 'INR', signed);
}

/** Rupees as typed ("1,250.50", "₹ 2000") → whole paise, or null when it is not an amount of 0.01 to 1 crore. */
export function parseRupees(text: string): number | null {
  const plain = text.replace(/[₹,\s]/g, '').replace(/^rs\.?/i, '');
  const match = /^(\d{1,8})(?:\.(\d{1,2}))?$/.exec(plain);
  if (!match) return null;
  const paise = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return paise >= 1 && paise <= 1_000_000_000 ? paise : null;
}

/** Paise as a plain number for a CSV cell: -125050 → "-1250.50". */
function csvAmount(paise: number): string {
  return (paise / 100).toFixed(2);
}

// ---------------------------------------------------------------- periods and the monthly summary

export type Period = 'month' | 'quarter' | 'year' | 'all';

/** The first day (YYYY-MM-DD) of a period ending today: this month, the last 3 months, this financial year (from 1 April), or null for all. */
export function periodStart(period: Period, today: string): string | null {
  const [y, m] = today.split('-').map(Number);
  if (period === 'month') return `${today.slice(0, 7)}-01`;
  if (period === 'quarter') {
    const back = new Date(Date.UTC(y, m - 3, 1));
    return `${back.getUTCFullYear()}-${String(back.getUTCMonth() + 1).padStart(2, '0')}-01`;
  }
  if (period === 'year') return `${m >= 4 ? y : y - 1}-04-01`;
  return null;
}

/** One month of the summary. */
export type MonthSummary = { month: string; incomePaise: number; expensePaise: number; netPaise: number; closingPaise: number };

/** Approved income, expense, net and the closing balance per month (YYYY-MM), newest first. */
export function monthlySummary(entries: readonly FundEntry[]): MonthSummary[] {
  const months = new Map<string, MonthSummary>();
  for (const e of [...entries].reverse()) {
    if (e.status !== 'approved') continue;
    const key = e.onDate.slice(0, 7);
    const row = months.get(key) ?? { month: key, incomePaise: 0, expensePaise: 0, netPaise: 0, closingPaise: 0 };
    if (e.direction === 'income') row.incomePaise += e.amountPaise;
    else row.expensePaise += e.amountPaise;
    row.netPaise += e.effectPaise;
    row.closingPaise = e.balanceAfterPaise ?? row.closingPaise;
    months.set(key, row);
  }
  return [...months.values()].sort((a, b) => b.month.localeCompare(a.month));
}

/** "2026-10" → "10-2026", as dates are shown (day-month-year). */
export function formatMonth(month: string): string {
  return `${month.slice(5, 7)}-${month.slice(0, 4)}`;
}

// ---------------------------------------------------------------- CSV

/** The file name of an export of `from`-`to` (YYYY-MM-DD; from null = from the start). */
export function fundFileName(from: string | null, to: string): string {
  return `mridanga-seva-fund-${from ?? 'start'}-to-${to}.csv`;
}

/**
 * The CSV rows of the given entries (oldest first) with headings in the app's language: date,
 * kind, category, amount (negative on a reversal), status, from/to, reference, note, bill, who
 * recorded and decided, the balance after. Then the monthly summary.
 */
export function fundCsvRows(book: FundBook, entries: readonly FundEntry[], t: TFunction, dateText: (iso: string) => string): string[][] {
  const category = new Map(book.categories.map((c) => [c.id, c]));
  const rows: string[][] = [
    [
      t('fund.csv.date'),
      t('fund.csv.kind'),
      t('fund.csv.category'),
      t('fund.csv.amount'),
      t('fund.csv.status'),
      t('fund.csv.party'),
      t('fund.csv.reference'),
      t('fund.csv.note'),
      t('fund.csv.bill'),
      t('fund.csv.recordedBy'),
      t('fund.csv.decidedBy'),
      t('fund.csv.balance'),
    ],
  ];
  for (const e of [...entries].reverse()) {
    rows.push([
      dateText(e.onDate),
      e.reversesId ? t('fund.reversalOf', { id: e.reversesId }) : t(`fund.directions.${e.direction}`),
      categoryName(t, category.get(e.categoryId)),
      csvAmount(e.amountPaise),
      t(`fund.statuses.${e.status}`),
      e.party ?? '',
      e.reference ?? '',
      [e.note, e.decisionNote].filter(Boolean).join(' / '),
      e.billName ?? '',
      e.createdByName,
      e.decidedByName ?? '',
      e.balanceAfterPaise === null ? '' : csvAmount(e.balanceAfterPaise),
    ]);
  }
  rows.push([]);
  rows.push([t('fund.csv.month'), t('fund.csv.income'), t('fund.csv.expense'), t('fund.csv.net'), t('fund.csv.closing')]);
  for (const m of monthlySummary(entries)) {
    rows.push([formatMonth(m.month), csvAmount(m.incomePaise), csvAmount(m.expensePaise), csvAmount(m.netPaise), csvAmount(m.closingPaise)]);
  }
  return rows;
}

// ---------------------------------------------------------------- recording

export type EntryForm = {
  direction: Direction;
  categoryId: number | null;
  /** As typed, DD-MM-YYYY. */
  date: string;
  amount: string;
  party: string;
  reference: string;
  note: string;
  bill: PickedFile | null;
};

export type EntryFormErrors = Partial<Record<'category' | 'date' | 'amount' | 'party' | 'reference' | 'note' | 'bill', ParseKeys>>;

/** Checks the form as the database will. `isoDate` = the parsed date or null. */
export function checkEntryForm(form: EntryForm, isoDate: string | null, today: string, billLimitPaise: number): EntryFormErrors {
  const errors: EntryFormErrors = {};
  if (form.categoryId === null) errors.category = 'fund.errors.category_invalid';
  if (!isoDate) errors.date = 'fund.errors.date_invalid';
  else if (isoDate > today) errors.date = 'fund.errors.date_future';
  const paise = parseRupees(form.amount);
  if (paise === null) errors.amount = 'fund.errors.amount_invalid';
  if (form.party.trim().length > PARTY_MAX) errors.party = 'fund.errors.party_too_long';
  if (form.reference.trim().length > REFERENCE_MAX) errors.reference = 'fund.errors.reference_too_long';
  if (form.note.trim().length > NOTE_MAX) errors.note = 'fund.errors.note_too_long';
  if (form.direction === 'expense' && paise !== null && paise > billLimitPaise && !form.bill) errors.bill = 'fund.errors.bill_required';
  return errors;
}

const BILL_LIMIT = { maxBytes: MAX_BILL_BYTES, tooBigKey: 'fund.errors.bill_too_big' as ParseKeys };

/** Opens the photo library or the file chooser for one bill. */
export async function pickBill(kind: 'image' | 'pdf'): Promise<PickResult> {
  return kind === 'pdf' ? pickPdfs(1, BILL_LIMIT) : pickPhotos(1, BILL_LIMIT);
}

/** Records an entry: uploads the bill first; if the entry cannot be saved, the bill is removed again. Returns the new id. */
export async function recordEntry(myId: string, form: EntryForm, isoDate: string): Promise<{ id?: number; errorKey?: ParseKeys }> {
  let bill: { path: string; name: string } | null = null;
  if (form.bill) {
    const uploaded = await uploadFiles(myId, [form.bill], BILLS_BUCKET);
    if (!uploaded.attachments) return { errorKey: uploaded.errorKey ?? 'fund.errors.upload_failed' };
    bill = uploaded.attachments[0];
  }
  const { data, error } = await supabase.rpc('record_fund_entry', {
    p_direction: form.direction,
    p_category: form.categoryId,
    p_on_date: isoDate,
    p_amount_paise: parseRupees(form.amount),
    p_party: form.party.trim() || null,
    p_reference: form.reference.trim() || null,
    p_note: form.note.trim() || null,
    p_bill_path: bill?.path ?? null,
    p_bill_name: bill?.name ?? null,
  });
  if (error) {
    if (bill) await removeFiles([bill.path], BILLS_BUCKET);
    return { errorKey: fundErrorKey(error.message, error.code) };
  }
  return { id: Number(data) };
}

/** Approves (approve true) or declines a waiting entry; a decline needs a reason. */
export async function decideEntry(id: number, approve: boolean, note: string): Promise<{ errorKey?: ParseKeys }> {
  const { error } = await supabase.rpc('decide_fund_entry', { p_entry: id, p_approve: approve, p_note: note.trim() || null });
  return error ? { errorKey: fundErrorKey(error.message, error.code) } : {};
}

/** The maker takes back their own waiting entry. */
export async function withdrawEntry(id: number, note: string): Promise<{ errorKey?: ParseKeys }> {
  const { error } = await supabase.rpc('withdraw_fund_entry', { p_entry: id, p_note: note.trim() || null });
  return error ? { errorKey: fundErrorKey(error.message, error.code) } : {};
}

/** Undoes an approved entry by a counter-entry, with a reason. Returns the reversal's id. */
export async function reverseEntry(id: number, reason: string): Promise<{ id?: number; errorKey?: ParseKeys }> {
  const { data, error } = await supabase.rpc('reverse_fund_entry', { p_entry: id, p_reason: reason.trim() });
  return error ? { errorKey: fundErrorKey(error.message, error.code) } : { id: Number(data) };
}

/** Opens a bill in the browser through a link that works for an hour. False = it could not be opened. */
export async function openBill(path: string): Promise<boolean> {
  try {
    const link = (await signedLinks([path], BILLS_BUCKET)).get(path);
    if (!link) return false;
    await WebBrowser.openBrowserAsync(link);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- categories (the Guru)

/** Adds a category of the Guru's own. */
export async function addCategory(direction: Direction, name: string): Promise<{ errorKey?: ParseKeys }> {
  const trimmed = name.trim();
  if (!trimmed) return { errorKey: 'fund.errors.category_name_required' };
  if (trimmed.length > CATEGORY_NAME_MAX) return { errorKey: 'fund.errors.category_name_too_long' };
  const { error } = await supabase.from('fund_categories').insert({ direction, name: trimmed });
  return error ? { errorKey: fundErrorKey(error.message, error.code) } : {};
}

/** Retires a category (no longer offered; its entries keep it) or offers it again. */
export async function setCategoryRetired(id: number, retired: boolean): Promise<{ errorKey?: ParseKeys }> {
  const { data, error } = await supabase
    .from('fund_categories')
    .update({ retired_at: retired ? new Date().toISOString() : null })
    .eq('id', id)
    .select('id');
  if (error) return { errorKey: fundErrorKey(error.message, error.code) };
  return data.length === 0 ? { errorKey: 'fund.errors.not_allowed' } : {};
}

const KNOWN = [
  'not_allowed',
  'category_invalid',
  'amount_invalid',
  'date_future',
  'date_too_old',
  'party_too_long',
  'reference_too_long',
  'note_too_long',
  'bill_invalid',
  'bill_not_yours',
  'bill_missing',
  'bill_required',
  'entry_not_found',
  'already_decided',
  'own_entry',
  'reason_required',
  'not_yours',
  'cannot_reverse',
  'already_reversed',
  'category_name_required',
  'category_name_too_long',
  'category_frozen',
] as const;

/** Turns a database error into a translation key. */
export function fundErrorKey(message: string, code: string | undefined): ParseKeys {
  const known = KNOWN.find((k) => k === message);
  if (known) return `fund.errors.${known}`;
  if (code === '23505') return 'fund.errors.category_name_taken';
  if (code === '42501') return 'fund.errors.not_allowed';
  return fallbackErrorKey(message);
}
