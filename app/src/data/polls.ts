// Polls (Phase 2 slice 5): C17 for coordinators and the Guru (create, edit, close, who has voted,
// Remind) and S12 for everyone a poll is for (vote once, change it until it closes, results).
// Migration 0022 (docs/DECISIONS.md #61, docs/DATABASE.md "Events and polls").
//
// The app writes the polls table directly (create, edit, close, delete). Votes are never read
// from the app: vote_poll() saves one, poll_state() gives counts, the person's own choice and
// the results when they may see them, poll_voters() (staff) who has voted — and what, only in a
// poll that is not anonymous.

import type { ParseKeys } from 'i18next';

import { formatTypedDate, localDate, localMoment, localTime, parseDayMonthYear, parseTimeOfDay } from '@/lib/dates';
import { supabase } from '@/lib/supabase';

import type { Audience } from './announcements';
import { isNetworkError } from './errors';

type MessageKey = ParseKeys;

/** Longest question and answer, and how many answers a poll has (C17); the database checks them too. */
export const QUESTION_MAX = 200;
export const OPTION_MAX = 80;
export const OPTIONS_MIN = 2;
export const OPTIONS_MAX = 6;
const PAST_DAYS = 60;

/** When the people voting see the results: once they voted, or only after the poll closes. */
export type ResultsWhen = 'after_vote' | 'after_close';

/** One poll. */
export type Poll = {
  id: number;
  question: string;
  options: string[];
  anonymous: boolean;
  resultsWhen: ResultsWhen;
  closesAt: string;
  closedAt: string | null;
  audience: Audience;
  audienceLevel: number | null;
  audienceGroup: number | null;
  createdBy: string | null;
  lastRemindedAt: string | null;
};

/** The state of a poll for the signed-in person (poll_state). */
export type PollState = {
  addressed: number;
  voted: number;
  closed: boolean;
  /** The poll is for them, so they may vote (while it is open). */
  canVote: boolean;
  /** Their choice, counting from 0, or null. */
  myChoice: number | null;
  /** Votes per answer, or null while they may not see the results. */
  results: number[] | null;
};

type PollRow = {
  id: number;
  question: string;
  options: string[];
  anonymous: boolean;
  results_when: ResultsWhen;
  closes_at: string;
  closed_at: string | null;
  audience: Audience;
  audience_level: number | null;
  audience_group: number | null;
  created_by: string | null;
  last_reminded_at: string | null;
};

const POLL_COLUMNS =
  'id, question, options, anonymous, results_when, closes_at, closed_at, audience, audience_level, audience_group, created_by, last_reminded_at';

function toPoll(r: PollRow): Poll {
  return {
    id: r.id,
    question: r.question,
    options: r.options,
    anonymous: r.anonymous,
    resultsWhen: r.results_when,
    closesAt: r.closes_at,
    closedAt: r.closed_at,
    audience: r.audience,
    audienceLevel: r.audience_level,
    audienceGroup: r.audience_group,
    createdBy: r.created_by,
    lastRemindedAt: r.last_reminded_at,
  };
}

const POLL_ERROR_CODES = [
  'not_allowed', 'poll_not_found', 'poll_closed', 'poll_has_votes', 'choice_invalid', 'question_required', 'question_too_long',
  'options_invalid', 'closes_required', 'closes_past', 'closes_too_far', 'audience_invalid', 'level_required', 'group_required',
  'too_soon',
] as const;

function errorKeyOf(message: string): MessageKey {
  if (isNetworkError(message)) return 'common.networkError';
  const code = POLL_ERROR_CODES.find((c) => message === c);
  if (code) return `polls.errors.${code}` as MessageKey;
  if (/row-level security|permission denied/i.test(message)) return 'polls.errors.not_allowed';
  return 'common.genericError';
}

/** True when the poll is closed (closed early, or past its closing time). */
export function isClosed(poll: Pick<Poll, 'closedAt' | 'closesAt'>, now = Date.now()): boolean {
  return poll.closedAt !== null || Date.parse(poll.closesAt) <= now;
}

/** True while staff may press Remind again (12 hours after the last one). */
export function canRemindPoll(poll: Pick<Poll, 'lastRemindedAt'>, now = Date.now()): boolean {
  return !poll.lastRemindedAt || Date.parse(poll.lastRemindedAt) <= now - 12 * 3600_000;
}

const NO_STATE: PollState = { addressed: 0, voted: 0, closed: false, canVote: false, myChoice: null, results: null };

async function fetchStates(ids: number[]): Promise<Map<number, PollState> | null> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase.rpc('poll_state', { p_ids: ids });
  if (error) return null;
  type Row = { poll_id: number; addressed: number; voted: number; closed: boolean; can_vote: boolean; my_choice: number | null; results: number[] | null };
  return new Map(
    (data as Row[]).map((r) => [
      r.poll_id,
      { addressed: r.addressed, voted: r.voted, closed: r.closed, canVote: r.can_vote, myChoice: r.my_choice, results: r.results },
    ]),
  );
}

/** One poll on a list, with its state. */
export type PollItem = { poll: Poll; state: PollState };

/** Open polls (closing soonest first) and closed ones of the last 60 days (newest first). */
export type PollList = { open: PollItem[]; closed: PollItem[]; groups: Map<number, string>; staff: Map<string, string> };

/** Loads the polls the signed-in person may see. null = could not be loaded. */
export async function fetchPolls(): Promise<PollList | null> {
  const since = new Date(Date.now() - PAST_DAYS * 86400_000).toISOString();
  const [polls, groups, staff] = await Promise.all([
    supabase.from('polls').select(POLL_COLUMNS).gte('closes_at', since).order('closes_at').limit(200),
    supabase.from('groups').select('id, name'),
    supabase.rpc('staff_names'),
  ]);
  if (polls.error || groups.error || staff.error) return null;
  const list = (polls.data as PollRow[]).map(toPoll);
  const states = await fetchStates(list.map((p) => p.id));
  if (!states) return null;
  const items = list.map((poll) => ({ poll, state: states.get(poll.id) ?? NO_STATE }));
  return {
    open: items.filter((i) => !i.state.closed && !isClosed(i.poll)),
    closed: items.filter((i) => i.state.closed || isClosed(i.poll)).reverse(),
    groups: new Map((groups.data as { id: number; name: string }[]).map((g) => [g.id, g.name])),
    staff: new Map((staff.data as { id: string; full_name: string }[]).map((s) => [s.id, s.full_name])),
  };
}

/** Open polls the signed-in person has not voted on yet (for the home). 0 when unknown. */
export async function fetchPollsToVote(): Promise<number> {
  const { data, error } = await supabase
    .from('polls')
    .select('id')
    .is('closed_at', null)
    .gt('closes_at', new Date().toISOString())
    .limit(50);
  if (error || data.length === 0) return 0;
  const states = await fetchStates((data as { id: number }[]).map((p) => p.id));
  if (!states) return 0;
  return [...states.values()].filter((s) => s.canVote && s.myChoice === null && !s.closed).length;
}

/** One poll with its state. 'not_found' when it is not there (deleted, or not for them). */
export async function fetchPoll(
  id: number,
): Promise<{ item: PollItem; groupName: string | null; authorName: string | null } | 'not_found' | null> {
  const [poll, staff] = await Promise.all([
    supabase.from('polls').select(POLL_COLUMNS).eq('id', id).maybeSingle<PollRow>(),
    supabase.rpc('staff_names'),
  ]);
  if (poll.error || staff.error) return null;
  if (!poll.data) return 'not_found';
  const p = toPoll(poll.data);
  const [states, group] = await Promise.all([
    fetchStates([id]),
    p.audienceGroup !== null
      ? supabase.from('groups').select('name').eq('id', p.audienceGroup).maybeSingle<{ name: string }>()
      : Promise.resolve(null),
  ]);
  if (!states) return null;
  const names = new Map((staff.data as { id: string; full_name: string }[]).map((s) => [s.id, s.full_name]));
  return {
    item: { poll: p, state: states.get(id) ?? NO_STATE },
    groupName: group?.data?.name ?? null,
    authorName: p.createdBy ? (names.get(p.createdBy) ?? null) : null,
  };
}

/** S12: vote, or change the vote (choice counts from 0). */
export async function votePoll(id: number, choice: number): Promise<{ errorKey?: MessageKey }> {
  const { error } = await supabase.rpc('vote_poll', { p_poll: id, p_choice: choice });
  return error ? { errorKey: errorKeyOf(error.message) } : {};
}

// ---------------------------------------------------------------- staff (C17)

/** One person a poll is for: whether they voted, and their choice when the poll is not anonymous. */
export type PollVoter = { profileId: string; fullName: string; rollNo: string | null; votedAt: string | null; choice: number | null };

/** Who a poll is for and who has voted. Staff only; null = could not load. */
export async function fetchVoters(id: number): Promise<PollVoter[] | null> {
  const { data, error } = await supabase.rpc('poll_voters', { p_poll: id });
  if (error) return null;
  return (
    data as { profile_id: string; full_name: string; roll_no: string | null; voted_at: string | null; choice: number | null }[]
  ).map((r) => ({ profileId: r.profile_id, fullName: r.full_name, rollNo: r.roll_no, votedAt: r.voted_at, choice: r.choice }));
}

/** Reminds those who have not voted. Returns how many were told. */
export async function remindPoll(id: number): Promise<{ reminded?: number; errorKey?: MessageKey }> {
  const { data, error } = await supabase.rpc('remind_poll', { p_poll: id });
  return error ? { errorKey: errorKeyOf(error.message) } : { reminded: data as number };
}

/** Closes a poll now; everyone it is for may then see the results. */
export async function closePoll(id: number): Promise<{ errorKey?: MessageKey }> {
  const { data, error } = await supabase.from('polls').update({ closed_at: new Date().toISOString() }).eq('id', id).select('id');
  if (error) return { errorKey: errorKeyOf(error.message) };
  return data.length === 0 ? { errorKey: 'polls.errors.not_allowed' } : {};
}

/** Deletes a poll nobody voted on yet (else the database says poll_has_votes). */
export async function deletePoll(id: number): Promise<{ errorKey?: MessageKey }> {
  const { data, error } = await supabase.from('polls').delete().eq('id', id).select('id');
  if (error) return { errorKey: errorKeyOf(error.message) };
  return data.length === 0 ? { errorKey: 'polls.errors.not_allowed' } : {};
}

// ---------------------------------------------------------------- the form (C17 create / edit)

export type PollForm = {
  question: string;
  options: string[];
  anonymous: boolean;
  resultsWhen: ResultsWhen;
  /** Closing day and time, at the class. */
  date: string;
  time: string;
  audience: Audience | null;
  levelId: number | null;
  groupId: number | null;
};

export type PollFormErrors = Partial<Record<keyof PollForm, MessageKey>>;

/** The form of a new poll: two empty answers, not anonymous, results after voting, closing at 20:00. */
export const EMPTY_POLL_FORM: PollForm = {
  question: '', options: ['', ''], anonymous: false, resultsWhen: 'after_vote', date: '', time: '20:00', audience: null,
  levelId: null, groupId: null,
};

/** The edit form filled from a saved poll; the closing time is shown as day and time at the class. */
export function formFromPoll(p: Poll): PollForm {
  return {
    question: p.question,
    options: [...p.options],
    anonymous: p.anonymous,
    resultsWhen: p.resultsWhen,
    date: formatTypedDate(localDate(p.closesAt)),
    time: localTime(p.closesAt),
    audience: p.audience,
    levelId: p.audienceLevel,
    groupId: p.audienceGroup,
  };
}

/** Checks the form like the database does. */
export function checkPollForm(form: PollForm, now = Date.now()): PollFormErrors {
  const errors: PollFormErrors = {};
  const question = form.question.trim();
  if (!question) errors.question = 'polls.errors.question_required';
  else if (question.length > QUESTION_MAX) errors.question = 'polls.errors.question_too_long';
  const options = form.options.map((o) => o.trim());
  const lower = options.map((o) => o.toLowerCase());
  if (
    options.length < OPTIONS_MIN ||
    options.length > OPTIONS_MAX ||
    options.some((o) => !o || o.length > OPTION_MAX) ||
    new Set(lower).size !== lower.length
  ) {
    errors.options = 'polls.errors.options_invalid';
  }
  const date = parseDayMonthYear(form.date);
  const time = parseTimeOfDay(form.time);
  if (!date) errors.date = 'events.form.dateInvalid';
  if (!time) errors.time = 'events.form.timeInvalid';
  if (date && time) {
    const closes = Date.parse(localMoment(date, time));
    if (closes <= now) errors.date = 'polls.errors.closes_past';
    else if (closes > now + 365 * 86400_000) errors.date = 'polls.errors.closes_too_far';
  }
  if (!form.audience) errors.audience = 'events.form.audienceRequired';
  else if (form.audience === 'level' && form.levelId === null) errors.levelId = 'polls.errors.level_required';
  else if (form.audience === 'group' && form.groupId === null) errors.groupId = 'polls.errors.group_required';
  return errors;
}

function rowOf(form: PollForm) {
  return {
    question: form.question.trim(),
    options: form.options.map((o) => o.trim()),
    anonymous: form.anonymous,
    results_when: form.resultsWhen,
    closes_at: localMoment(parseDayMonthYear(form.date) as string, parseTimeOfDay(form.time) as string),
    audience: form.audience,
    audience_level: form.audience === 'level' ? form.levelId : null,
    audience_group: form.audience === 'group' ? form.groupId : null,
  };
}

/** Creates a poll; everyone it is for is told. Returns the new id. */
export async function createPoll(form: PollForm): Promise<{ id?: number; errorKey?: MessageKey }> {
  const { data, error } = await supabase.from('polls').insert(rowOf(form)).select('id').single<{ id: number }>();
  return error ? { errorKey: errorKeyOf(error.message) } : { id: data.id };
}

/**
 * Saves changes. After the first vote only the wording of the question and the closing time may
 * change (the database refuses the rest), so only what changed is sent.
 */
export async function updatePoll(original: Poll, form: PollForm): Promise<{ errorKey?: MessageKey }> {
  const row = rowOf(form);
  const changes: Record<string, unknown> = {};
  if (row.question !== original.question) changes.question = row.question;
  if (JSON.stringify(row.options) !== JSON.stringify(original.options)) changes.options = row.options;
  if (row.anonymous !== original.anonymous) changes.anonymous = row.anonymous;
  if (row.results_when !== original.resultsWhen) changes.results_when = row.results_when;
  if (Date.parse(row.closes_at) !== Date.parse(original.closesAt)) changes.closes_at = row.closes_at;
  if (row.audience !== original.audience || row.audience_level !== original.audienceLevel || row.audience_group !== original.audienceGroup) {
    changes.audience = row.audience;
    changes.audience_level = row.audience_level;
    changes.audience_group = row.audience_group;
  }
  if (Object.keys(changes).length === 0) return {};
  const { data, error } = await supabase.from('polls').update(changes).eq('id', original.id).select('id');
  if (error) return { errorKey: errorKeyOf(error.message) };
  return data.length === 0 ? { errorKey: 'polls.errors.not_allowed' } : {};
}
