// Option lists the Guru edits (G12): gender, how people heard of the class, education / occupation,
// service areas, the relation of an emergency contact and the instruments people want to learn (table choice_options, migration 0036, docs/DECISIONS.md
// #166). Rows store the code; the label is shown in the reader's language, English when missing.

import type { ParseKeys } from 'i18next';

import { supabase } from '@/lib/supabase';

import { isNetworkError } from './errors';

/** The six lists. */
export const OPTION_LISTS = ['gender', 'instrument', 'source', 'occupation', 'service_area', 'relation'] as const;
export type OptionList = (typeof OPTION_LISTS)[number];

/** One option as the forms get it (sign_up_choices, my_about). */
export type Option = { code: string; en: string; te: string | null; hi: string | null };

/** Options by list, active ones only, in the Guru's order. */
export type OptionSets = Record<OptionList, Option[]>;

export const EMPTY_OPTION_SETS: OptionSets = { gender: [], instrument: [], source: [], occupation: [], service_area: [], relation: [] };

/** The code that adds a free-text box ("Other: ..."). */
export const OTHER = 'other';

/** The option's label in `language` ('en', 'te', 'hi'), English when that one is missing. */
export function optionLabel(option: Option, language: string): string {
  if (language === 'te' && option.te) return option.te;
  if (language === 'hi' && option.hi) return option.hi;
  return option.en;
}

/** The label of `code` in a list, or the code itself (an option switched off since). */
export function labelOf(options: readonly Option[], code: string | null | undefined, language: string): string {
  if (!code) return '';
  const option = options.find((o) => o.code === code);
  return option ? optionLabel(option, language) : code;
}

/** Turns the lists object of my_about() into OptionSets (missing lists empty). */
export function optionSetsFrom(raw: Partial<Record<string, Option[]>> | null | undefined): OptionSets {
  const sets = { ...EMPTY_OPTION_SETS };
  for (const list of OPTION_LISTS) sets[list] = raw?.[list] ?? [];
  return sets;
}

// ---------------------------------------------------------------- G12, the Guru's editor

/** One row of choice_options for the editor, switched-off ones too. */
export type OptionRow = Option & { id: number; list: OptionList; sort: number; active: boolean };

/** Every option of every list, for G12 and for staff screens that show labels. Null when it failed. */
export async function fetchAllOptions(): Promise<OptionRow[] | null> {
  const { data, error } = await supabase
    .from('choice_options')
    .select('id, list, code, label_en, label_te, label_hi, sort, active')
    .order('sort')
    .order('id');
  if (error) return null;
  return (data as { id: number; list: OptionList; code: string; label_en: string; label_te: string | null;
    label_hi: string | null; sort: number; active: boolean }[]).map((r) => ({
    id: r.id, list: r.list, code: r.code, en: r.label_en, te: r.label_te, hi: r.label_hi, sort: r.sort, active: r.active,
  }));
}

/** Active options by list, from the rows of fetchAllOptions. */
export function activeSets(rows: readonly OptionRow[]): OptionSets {
  const sets = { ...EMPTY_OPTION_SETS };
  for (const list of OPTION_LISTS) sets[list] = rows.filter((r) => r.list === list && r.active);
  return sets;
}

/** The labels being typed for one option. */
export type OptionLabels = { en: string; te: string; hi: string };

/** A new option's code from its English label: 'Radio programme' → 'radio_programme'. */
export function codeFromLabel(label: string): string {
  const base = label
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return /^[a-z]/.test(base) ? base : `o_${base}`.slice(0, 40).replace(/_+$/, '') || 'option';
}

/** Checks the labels: English 1-80 characters; Telugu and Hindi optional, at most 80. */
export function checkLabels(labels: OptionLabels): Partial<Record<keyof OptionLabels, ParseKeys>> {
  const errors: Partial<Record<keyof OptionLabels, ParseKeys>> = {};
  if (!labels.en.trim()) errors.en = 'options.errors.labelRequired';
  for (const key of ['en', 'te', 'hi'] as const) {
    if (labels[key].trim().length > 80) errors[key] = 'options.errors.labelTooLong';
  }
  return errors;
}

function optionErrorKey(message: string): ParseKeys {
  switch (message) {
    case 'option_in_use':
      return 'options.errors.inUse';
    case 'option_required':
      return 'options.errors.required';
    case 'label_invalid':
      return 'options.errors.labelInvalid';
  }
  if (/duplicate key|choice_options_list_code_key/.test(message)) return 'options.errors.duplicate';
  if (/row-level security/.test(message)) return 'options.errors.notAllowed';
  return isNetworkError(message) ? 'common.networkError' : 'common.genericError';
}

/** Adds an option at the end of its list (before "Other"). */
export async function addOption(list: OptionList, labels: OptionLabels, sort: number): Promise<{ errorKey?: ParseKeys }> {
  const { error } = await supabase.from('choice_options').insert({
    list, code: codeFromLabel(labels.en), label_en: labels.en.trim(),
    label_te: labels.te.trim() || null, label_hi: labels.hi.trim() || null, sort,
  });
  return error ? { errorKey: optionErrorKey(error.message) } : {};
}

/** Saves the labels of an option. */
export async function saveOptionLabels(id: number, labels: OptionLabels): Promise<{ errorKey?: ParseKeys }> {
  const { data, error } = await supabase
    .from('choice_options')
    .update({ label_en: labels.en.trim(), label_te: labels.te.trim() || null, label_hi: labels.hi.trim() || null })
    .eq('id', id)
    .select('id');
  if (error) return { errorKey: optionErrorKey(error.message) };
  return data && data.length > 0 ? {} : { errorKey: 'options.errors.notAllowed' };
}

/** Switches an option on (offered) or off (not offered; answers already given keep it). */
export async function setOptionActive(id: number, active: boolean): Promise<{ errorKey?: ParseKeys }> {
  const { error } = await supabase.from('choice_options').update({ active }).eq('id', id);
  return error ? { errorKey: optionErrorKey(error.message) } : {};
}

/** Swaps the order of two options of a list (Up / Down). */
export async function swapOptions(a: OptionRow, b: OptionRow): Promise<{ errorKey?: ParseKeys }> {
  // Equal sorts (new rows) would not move: give them distinct places first.
  const [sa, sb] = a.sort === b.sort ? [b.sort + 1, a.sort] : [b.sort, a.sort];
  const first = await supabase.from('choice_options').update({ sort: sa }).eq('id', a.id);
  if (first.error) return { errorKey: optionErrorKey(first.error.message) };
  const second = await supabase.from('choice_options').update({ sort: sb }).eq('id', b.id);
  return second.error ? { errorKey: optionErrorKey(second.error.message) } : {};
}

/** Deletes an option nobody chose (the database refuses one in use or needed by the rules). */
export async function deleteOption(id: number): Promise<{ errorKey?: ParseKeys }> {
  const { error } = await supabase.from('choice_options').delete().eq('id', id);
  return error ? { errorKey: optionErrorKey(error.message) } : {};
}
