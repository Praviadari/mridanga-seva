// C19 Inventory (Phase 2 slice 8, docs/DECISIONS.md #65): the temple's instruments and other
// items. The Guru adds, edits and retires items; any coordinator (or the Guru) lends one to a
// student or a staff member and takes it back, each time with the condition seen, and records
// condition checks. A borrower sees what they hold (A3 profile; C8 for staff). The database
// checks everything again (migration 0023_team_tools.sql): who may do what, one loan per item,
// a note for anything but "good", no damaged item lent.

import type { ParseKeys } from 'i18next';

import { supabase } from '@/lib/supabase';

import { fallbackErrorKey } from './errors';

/**
 * Kinds of item: clay khol, fibreglass (Balaram / Tilak), fibreglass body with skin heads, brass, as in
 * the table "Kinds of mridanga" of docs/guide/01-why-this-app.md, kartals, and since 0035 every other
 * seva asset (docs/DECISIONS.md #156): harmonium, other instruments, sound, drum covers and bags,
 * books, furniture, altar and puja items, other.
 */
export const ITEM_KINDS = [
  'clay_khol',
  'fibreglass',
  'fibre_skin',
  'brass',
  'kartals',
  'harmonium',
  'instrument',
  'sound',
  'cover_bag',
  'book',
  'furniture',
  'altar',
  'other',
] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

/** Condition, best first. */
export const CONDITIONS = ['good', 'needs_care', 'damaged', 'in_repair'] as const;
export type Condition = (typeof CONDITIONS)[number];

/** Conditions an item may go out in. */
export const LENDABLE: readonly Condition[] = ['good', 'needs_care'];

/** Longest name, notes and condition note, as in the database. */
export const LABEL_MAX = 60;
export const NOTES_MAX = 500;
/** Longest free-text category (0035). */
export const CATEGORY_MAX = 40;

/** Who holds an item now. */
export type Holder = {
  loanId: number;
  /** A student record (with or without a login) or a staff member. */
  studentId: string | null;
  profileId: string | null;
  name: string;
  rollNo: string | null;
  issuedAt: string;
  dueOn: string | null;
  conditionOut: Condition;
  issueNote: string | null;
};

/** One item. */
export type InventoryItem = {
  id: number;
  centreId: number;
  /** The centre's name, as printed on the label. */
  centreName: string;
  /** Human code on the label, e.g. KHOL-007 (0035). */
  code: string;
  /** Free-text category inside the kind, e.g. Mixer. */
  category: string | null;
  /** The label's token: the QR holds assetLink(assetToken) (src/lib/asset-link.ts). */
  assetToken: string;
  /** When the label was last marked printed. */
  labelledAt: string | null;
  kind: ItemKind;
  label: string;
  notes: string | null;
  condition: Condition;
  conditionNote: string | null;
  conditionAt: string;
  retiredAt: string | null;
  holder: Holder | null;
};

/** One entry of an item's history. */
export type ItemCheck = {
  id: number;
  kind: 'added' | 'check' | 'issue' | 'return';
  condition: Condition;
  note: string | null;
  by: string;
  at: string;
  /** For issue and return: who had it. */
  borrower: string | null;
};

type LoanRow = {
  id: number;
  item_id: number;
  student_id: string | null;
  profile_id: string | null;
  issued_at: string;
  due_on: string | null;
  condition_out: Condition;
  issue_note: string | null;
  student: { full_name: string; roll_no: string | null } | null;
  person: { full_name: string } | null;
};

type ItemRow = {
  id: number;
  centre_id: number;
  code: string;
  category: string | null;
  asset_token: string;
  labelled_at: string | null;
  centre: { name: string } | null;
  kind: ItemKind;
  label: string;
  notes: string | null;
  condition: Condition;
  condition_note: string | null;
  condition_at: string;
  retired_at: string | null;
};

const ITEM_COLUMNS =
  'id, centre_id, code, category, asset_token, labelled_at, centre:centres(name), ' +
  'kind, label, notes, condition, condition_note, condition_at, retired_at';
const LOAN_COLUMNS =
  'id, item_id, student_id, profile_id, issued_at, due_on, condition_out, issue_note, ' +
  'student:students(full_name, roll_no), person:profiles!inventory_loans_profile_id_fkey(full_name)';

function toHolder(row: LoanRow): Holder {
  return {
    loanId: row.id,
    studentId: row.student_id,
    profileId: row.profile_id,
    name: row.student?.full_name ?? row.person?.full_name ?? '',
    rollNo: row.student?.roll_no ?? null,
    issuedAt: row.issued_at,
    dueOn: row.due_on,
    conditionOut: row.condition_out,
    issueNote: row.issue_note,
  };
}

function toItem(row: ItemRow, holder: Holder | null): InventoryItem {
  return {
    id: row.id,
    centreId: row.centre_id,
    centreName: row.centre?.name ?? '',
    code: row.code,
    category: row.category,
    assetToken: row.asset_token,
    labelledAt: row.labelled_at,
    kind: row.kind,
    label: row.label,
    notes: row.notes,
    condition: row.condition,
    conditionNote: row.condition_note,
    conditionAt: row.condition_at,
    retiredAt: row.retired_at,
    holder,
  };
}

async function openLoans(itemIds?: number[]): Promise<Map<number, Holder> | null> {
  let query = supabase.from('inventory_loans').select(LOAN_COLUMNS).is('returned_at', null);
  if (itemIds) query = query.in('item_id', itemIds);
  const { data, error } = await query;
  if (error) return null;
  return new Map((data as unknown as LoanRow[]).map((row) => [row.item_id, toHolder(row)]));
}

/** Every item with who holds it, in name order (retired ones too). null = could not be loaded. */
export async function fetchInventory(): Promise<InventoryItem[] | null> {
  const [items, loans] = await Promise.all([
    supabase.from('inventory_items').select(ITEM_COLUMNS).order('code'),
    openLoans(),
  ]);
  if (items.error || !loans) return null;
  return (items.data as unknown as ItemRow[]).map((row) => toItem(row, loans.get(row.id) ?? null));
}

/** One item with its history, newest first. */
export async function fetchItem(id: number): Promise<{ item: InventoryItem; history: ItemCheck[] } | 'not_found' | null> {
  const [item, loans, checks] = await Promise.all([
    supabase.from('inventory_items').select(ITEM_COLUMNS).eq('id', id).maybeSingle<ItemRow>(),
    openLoans([id]),
    supabase
      .from('inventory_checks')
      .select(
        'id, kind, condition, note, checked_at, by:profiles!inventory_checks_checked_by_fkey(full_name), ' +
          'loan:inventory_loans(student:students(full_name), person:profiles!inventory_loans_profile_id_fkey(full_name))',
      )
      .eq('item_id', id)
      .order('checked_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(100),
  ]);
  if (item.error || !loans || checks.error) return null;
  if (!item.data) return 'not_found';
  type CheckRow = {
    id: number;
    kind: ItemCheck['kind'];
    condition: Condition;
    note: string | null;
    checked_at: string;
    by: { full_name: string } | null;
    loan: { student: { full_name: string } | null; person: { full_name: string } | null } | null;
  };
  return {
    item: toItem(item.data, loans.get(id) ?? null),
    history: (checks.data as unknown as CheckRow[]).map((row) => ({
      id: row.id,
      kind: row.kind,
      condition: row.condition,
      note: row.note,
      by: row.by?.full_name ?? '',
      at: row.checked_at,
      borrower: row.loan?.student?.full_name ?? row.loan?.person?.full_name ?? null,
    })),
  };
}

/** What a borrower holds now (a student record, or the signed-in staff member's own). */
export type HeldItem = { loanId: number; itemId: number; kind: ItemKind; label: string; issuedAt: string; dueOn: string | null };

/**
 * Items held now: by a student record (C8), by a staff login, or 'mine' for a signed-in student
 * (row-level security keeps it to their own loans).
 */
export async function fetchHeldItems(by: { studentId: string } | { profileId: string } | 'mine'): Promise<HeldItem[] | null> {
  let query = supabase
    .from('inventory_loans')
    .select('id, item_id, issued_at, due_on, item:inventory_items(kind, label)')
    .is('returned_at', null)
    .order('issued_at');
  if (by !== 'mine') query = 'studentId' in by ? query.eq('student_id', by.studentId) : query.eq('profile_id', by.profileId);
  const { data, error } = await query;
  if (error) return null;
  type Row = { id: number; item_id: number; issued_at: string; due_on: string | null; item: { kind: ItemKind; label: string } | null };
  return (data as unknown as Row[]).flatMap((row) =>
    row.item
      ? [{ loanId: row.id, itemId: row.item_id, kind: row.item.kind, label: row.item.label, issuedAt: row.issued_at, dueOn: row.due_on }]
      : [],
  );
}
// ---------------------------------------------------------------- the Guru's item form

export type ItemForm = { kind: ItemKind; label: string; category: string; notes: string; condition: Condition; conditionNote: string };
export type ItemFormErrors = Partial<Record<'label' | 'category' | 'notes' | 'conditionNote', ParseKeys>>;

/**
 * C19: checks the Guru's item form: a name of at most LABEL_MAX, notes of at most NOTES_MAX, and for a
 * new item in any condition but Good a note saying what is wrong. Returns a message key per field in error.
 */
export function checkItemForm(form: ItemForm, isNew: boolean): ItemFormErrors {
  const errors: ItemFormErrors = {};
  const label = form.label.trim();
  if (!label) errors.label = 'inventory.errors.label_required';
  else if (label.length > LABEL_MAX) errors.label = 'inventory.errors.label_too_long';
  if (form.category.trim().length > CATEGORY_MAX) errors.category = 'inventory.errors.category_too_long';
  if (form.notes.trim().length > NOTES_MAX) errors.notes = 'inventory.errors.notes_too_long';
  if (isNew && form.condition !== 'good' && !form.conditionNote.trim()) errors.conditionNote = 'inventory.errors.note_required';
  return errors;
}

/** Adds an item (with its first condition) or saves the kind, name and notes of one. */
export async function saveItem(id: number | null, form: ItemForm): Promise<{ id?: number; errorKey?: ParseKeys }> {
  const fields = { kind: form.kind, label: form.label.trim(), category: form.category.trim() || null, notes: form.notes.trim() || null };
  const { data, error } =
    id === null
      ? await supabase
          .from('inventory_items')
          .insert({ ...fields, condition: form.condition, condition_note: form.conditionNote.trim() || null })
          .select('id')
      : await supabase.from('inventory_items').update(fields).eq('id', id).select('id');
  if (error) return { errorKey: inventoryErrorKey(error.message, error.code) };
  if (data.length === 0) return { errorKey: 'inventory.errors.item_not_found' };
  return { id: (data[0] as { id: number }).id };
}

/** Retires an item (no longer lent) or puts it back in use. */
export async function setRetired(id: number, retired: boolean): Promise<{ errorKey?: ParseKeys }> {
  const { error } = await supabase
    .from('inventory_items')
    .update({ retired_at: retired ? new Date().toISOString() : null })
    .eq('id', id);
  return error ? { errorKey: inventoryErrorKey(error.message, error.code) } : {};
}

/** Deletes an item added by mistake (never lent). */
export async function deleteItem(id: number): Promise<{ errorKey?: ParseKeys }> {
  const { error } = await supabase.from('inventory_items').delete().eq('id', id);
  if (error?.code === '23503') return { errorKey: 'inventory.errors.has_history' };
  return error ? { errorKey: inventoryErrorKey(error.message, error.code) } : {};
}

// ---------------------------------------------------------------- lending

/** A person an item can be lent to. */
export type Borrower = { kind: 'student'; id: string; name: string; rollNo: string | null } | { kind: 'staff'; id: string; name: string };

/** Students (not Left) and staff whose name or roll number matches `text` (at least 2 letters). */
export async function searchBorrowers(text: string): Promise<Borrower[] | null> {
  const term = text.trim().replace(/[%,()*]/g, ' ');
  if (term.length < 2) return [];
  const [students, staff] = await Promise.all([
    supabase
      .from('students')
      .select('id, full_name, roll_no')
      .neq('status', 'left')
      .or(`full_name.ilike.%${term}%,roll_no.ilike.%${term}%`)
      .order('full_name')
      .limit(8),
    supabase
      .from('profiles')
      .select('id, full_name')
      .in('role', ['guru', 'coordinator'])
      .eq('active', true)
      .ilike('full_name', `%${term}%`)
      .order('full_name')
      .limit(5),
  ]);
  if (students.error || staff.error) return null;
  return [
    ...(students.data as { id: string; full_name: string; roll_no: string | null }[]).map(
      (s): Borrower => ({ kind: 'student', id: s.id, name: s.full_name, rollNo: s.roll_no }),
    ),
    ...(staff.data as { id: string; full_name: string }[]).map((p): Borrower => ({ kind: 'staff', id: p.id, name: p.full_name })),
  ];
}

/** Lends an item. `dueOn` = YYYY-MM-DD or null. */
export async function issueItem(
  itemId: number,
  borrower: Borrower,
  condition: Condition,
  note: string,
  dueOn: string | null,
): Promise<{ errorKey?: ParseKeys }> {
  const { error } = await supabase.rpc('issue_inventory_item', {
    p_item: itemId,
    p_student: borrower.kind === 'student' ? borrower.id : null,
    p_profile: borrower.kind === 'staff' ? borrower.id : null,
    p_condition: condition,
    p_note: note.trim() || null,
    p_due_on: dueOn,
  });
  return error ? { errorKey: inventoryErrorKey(error.message, error.code) } : {};
}

/** Takes an item back. */
export async function returnItem(loanId: number, condition: Condition, note: string): Promise<{ errorKey?: ParseKeys }> {
  const { error } = await supabase.rpc('return_inventory_item', { p_loan: loanId, p_condition: condition, p_note: note.trim() || null });
  return error ? { errorKey: inventoryErrorKey(error.message, error.code) } : {};
}

/** Records a condition check. */
export async function checkItem(itemId: number, condition: Condition, note: string): Promise<{ errorKey?: ParseKeys }> {
  const { error } = await supabase.rpc('check_inventory_item', { p_item: itemId, p_condition: condition, p_note: note.trim() || null });
  return error ? { errorKey: inventoryErrorKey(error.message, error.code) } : {};
}

// ---------------------------------------------------------------- labels (0035, DECISIONS #156-#161)

/** What a label's token led to (resolve_asset). */
export type Resolved =
  | { result: 'ok'; id: number; code: string; label: string; centre: string; retired: boolean }
  | { result: 'unknown' }
  | { result: 'other_centre'; centre: string };

/** Finds the item of a label's token, for staff. */
export async function resolveAsset(token: string): Promise<Resolved | { errorKey: ParseKeys }> {
  const { data, error } = await supabase.rpc('resolve_asset', { p_token: token });
  if (error) return { errorKey: inventoryErrorKey(error.message, error.code) };
  return data as Resolved;
}

/** Notes that the labels of these items were printed. Returns how many were stamped, or null. */
export async function markLabelsPrinted(ids: number[]): Promise<number | null> {
  const { data, error } = await supabase.rpc('mark_labels_printed', { p_items: ids });
  return error ? null : (data as number);
}

/** The centre of the signed-in staff member's login (null = none set), for the stocktake and labels. */
export async function fetchMyCentreId(profileId: string): Promise<number | null> {
  const { data } = await supabase.from('profiles').select('centre_id').eq('id', profileId).maybeSingle<{ centre_id: number | null }>();
  return data?.centre_id ?? null;
}

// ---------------------------------------------------------------- stocktake

/** A listed item in a count's summary. */
export type CountedItem = { id: number; code: string; label: string; kind: ItemKind; holder?: string | null };

/** One count of a centre's items. */
export type Stocktake = {
  id: number;
  centreId: number;
  centreName: string;
  startedBy: string;
  startedAt: string;
  finishedBy: string | null;
  finishedAt: string | null;
  note: string | null;
  expected: number | null;
  seen: number | null;
  lent: number | null;
  missing: number | null;
  summary: { lent: CountedItem[]; missing: CountedItem[] } | null;
};

type StocktakeRow = {
  id: number;
  centre_id: number;
  started_at: string;
  finished_at: string | null;
  note: string | null;
  expected: number | null;
  seen: number | null;
  lent: number | null;
  missing: number | null;
  summary: Stocktake['summary'];
  centre: { name: string } | null;
  starter: { full_name: string } | null;
  finisher: { full_name: string } | null;
};

const STOCKTAKE_COLUMNS =
  'id, centre_id, started_at, finished_at, note, expected, seen, lent, missing, summary, centre:centres(name), ' +
  'starter:profiles!inventory_stocktakes_started_by_fkey(full_name), finisher:profiles!inventory_stocktakes_finished_by_fkey(full_name)';

function toStocktake(row: StocktakeRow): Stocktake {
  return {
    id: row.id,
    centreId: row.centre_id,
    centreName: row.centre?.name ?? '',
    startedBy: row.starter?.full_name ?? '',
    startedAt: row.started_at,
    finishedBy: row.finisher?.full_name ?? null,
    finishedAt: row.finished_at,
    note: row.note,
    expected: row.expected,
    seen: row.seen,
    lent: row.lent,
    missing: row.missing,
    summary: row.summary,
  };
}

/** The latest counts, newest first (open ones on top). null = could not be loaded. */
export async function fetchStocktakes(): Promise<Stocktake[] | null> {
  const { data, error } = await supabase
    .from('inventory_stocktakes')
    .select(STOCKTAKE_COLUMNS)
    .order('finished_at', { ascending: false, nullsFirst: true })
    .order('started_at', { ascending: false })
    .limit(30);
  return error ? null : (data as unknown as StocktakeRow[]).map(toStocktake);
}

/** One count with the ids of the items seen in it so far. */
export async function fetchStocktake(id: number): Promise<{ stocktake: Stocktake; seenIds: Set<number> } | 'not_found' | null> {
  const [count, seen] = await Promise.all([
    supabase.from('inventory_stocktakes').select(STOCKTAKE_COLUMNS).eq('id', id).maybeSingle(),
    supabase.from('inventory_stocktake_items').select('item_id').eq('stocktake_id', id),
  ]);
  if (count.error || seen.error) return null;
  if (!count.data) return 'not_found';
  return {
    stocktake: toStocktake(count.data as unknown as StocktakeRow),
    seenIds: new Set((seen.data as { item_id: number }[]).map((r) => r.item_id)),
  };
}

/** Starts a count at a centre, or joins the open one there. Returns its id. */
export async function startStocktake(centreId: number): Promise<{ id?: number; errorKey?: ParseKeys }> {
  const { data, error } = await supabase.rpc('start_stocktake', { p_centre: centreId });
  return error ? { errorKey: inventoryErrorKey(error.message, error.code) } : { id: data as number };
}

/** What marking an item in a count said (stocktake_see). */
export type SeenResult =
  | { result: 'seen' | 'already' | 'retired'; id: number; code: string; label: string }
  | { result: 'other_centre'; code: string; label: string; centre: string }
  | { result: 'unknown' };

/** Marks an item seen in an open count: by a label's token (scan) or the item's id (tap). */
export async function stocktakeSee(stocktakeId: number, by: { token: string } | { itemId: number }): Promise<SeenResult | { errorKey: ParseKeys }> {
  const { data, error } = await supabase.rpc('stocktake_see', {
    p_stocktake: stocktakeId,
    p_token: 'token' in by ? by.token : null,
    p_item: 'itemId' in by ? by.itemId : null,
  });
  if (error) return { errorKey: inventoryErrorKey(error.message, error.code) };
  return data as SeenResult;
}

/** Finishes an open count with an optional note; the summary is saved with it. */
export async function finishStocktake(stocktakeId: number, note: string): Promise<{ errorKey?: ParseKeys }> {
  const { error } = await supabase.rpc('finish_stocktake', { p_stocktake: stocktakeId, p_note: note.trim() || null });
  return error ? { errorKey: inventoryErrorKey(error.message, error.code) } : {};
}

/** The Guru deletes an open count started by mistake. */
export async function deleteStocktake(stocktakeId: number): Promise<{ errorKey?: ParseKeys }> {
  const { data, error } = await supabase.from('inventory_stocktakes').delete().eq('id', stocktakeId).select('id');
  if (error) return { errorKey: inventoryErrorKey(error.message, error.code) };
  return data.length === 0 ? { errorKey: 'inventory.errors.not_allowed' } : {};
}

const KNOWN = [
  'label_required',
  'label_too_long',
  'notes_too_long',
  'condition_frozen',
  'item_out',
  'item_not_found',
  'item_retired',
  'item_not_lendable',
  'borrower_required',
  'borrower_not_found',
  'due_past',
  'condition_invalid',
  'note_required',
  'note_too_long',
  'loan_not_found',
  'already_returned',
  'category_too_long',
  'asset_locked',
  'centre_not_found',
  'stocktake_not_found',
  'stocktake_closed',
] as const;

/** Turns a database error into a translation key. */
export function inventoryErrorKey(message: string, code: string | undefined): ParseKeys {
  const known = KNOWN.find((k) => k === message);
  if (known) return `inventory.errors.${known}`;
  if (code === '23505') return 'inventory.errors.label_taken';
  if (code === '42501' || message === 'not_allowed') return 'inventory.errors.not_allowed';
  return fallbackErrorKey(message);
}
