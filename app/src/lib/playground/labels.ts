// Progress labels (docs/RHYTHM_PLAYGROUND.md §12.1-§12.2, DYN-05, DYN-08; #727): Exploring, Practising, Steady,
// Ready for Review — starting rules, calibrated in the pilot; the numbers live in the setting playground_labels
// (sent with the pack) and change without an app update. Recognition and timing are never added together:
//   recognition  Exploring < 10 items in 30 days · Practising 10+ · Steady ≥ 80 % of the last 20 items at the
//                current step, on 2+ days, ≤ 1 replay on average · Ready for Review = Steady at the top step;
//   timing       only rounds measured on a calibrated phone count: Exploring < 3 · Practising 3+ · Steady = the
//                last 3 at the current step have median error ≤ 60 ms and spread ≤ 50 ms, on 2+ days · Ready for
//                Review = Steady at the top step. An uncalibrated phone never gets a timing label above Exploring.
// "Ready for Review" means a check in class: only the facilitator's rating says a performance skill is shown,
// only the teacher's tick moves the level path (#685). Skills judged by a person get no label from the app.

import { SKILL_KIND, type LabelRules, type PlayedRound, type ProgressLabel, type SkillId, type SkillProgress } from './types';

export const DEFAULT_LABEL_RULES: LabelRules = {
  practisingItems: 10,
  steadyShare: 0.8,
  steadyItems: 20,
  steadyDays: 2,
  steadyMaxReplays: 1,
  timingRounds: 3,
  timingMedianMs: 60,
  timingSpreadMs: 50,
  timingDays: 2,
  windowDays: 30,
};

const DAY_MS = 24 * 60 * 60 * 1000;
const TREND_DAYS = 14;

/** The phone's own calendar day of a time. */
const localDay = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

const doneAt = (r: PlayedRound) => Date.parse(r.finishedAt ?? r.startedAt);

type TimedItem = { at: number; ok: boolean; rp: number; step: number };

function recognition(skill: SkillId, rounds: PlayedRound[], rules: LabelRules, top: number, now: number): SkillProgress {
  const items: TimedItem[] = [];
  for (const r of rounds) {
    const at = doneAt(r);
    for (const i of r.items) if (typeof i.ok === 'boolean') items.push({ at, ok: i.ok, rp: i.rp ?? 0, step: r.step });
  }
  items.sort((a, b) => a.at - b.at);
  const latest = rounds.length > 0 ? rounds.reduce((a, b) => (doneAt(b) >= doneAt(a) ? b : a)) : null;
  const step = latest?.step ?? null;
  const last = items.filter((i) => i.step === step).slice(-rules.steadyItems);
  const right = last.filter((i) => i.ok).length;
  const days = new Set(last.map((i) => localDay(i.at))).size;
  const replays = last.length > 0 ? last.reduce((s, i) => s + i.rp, 0) / last.length : 0;
  const steady = last.length >= rules.steadyItems && right / last.length >= rules.steadyShare && days >= rules.steadyDays
    && replays <= rules.steadyMaxReplays;
  const label: ProgressLabel = steady
    ? step !== null && step >= top ? 'ready_for_review' : 'steady'
    : items.length >= rules.practisingItems ? 'practising' : 'exploring';
  const recent = items.filter((i) => now - i.at < TREND_DAYS * DAY_MS).filter((i) => i.ok).length;
  const before = items.filter((i) => now - i.at >= TREND_DAYS * DAY_MS && now - i.at < 2 * TREND_DAYS * DAY_MS).filter((i) => i.ok).length;
  return {
    skill,
    kind: 'recognition',
    label,
    opportunities: items.length,
    correct: items.filter((i) => i.ok).length,
    step,
    lastPractised: latest ? new Date(doneAt(latest)).toISOString() : null,
    trend: recent === 0 && before === 0 ? null : recent > before ? 'more' : recent < before ? 'fewer' : 'same',
    timingConfidence: null,
  };
}

function timing(skill: SkillId, rounds: PlayedRound[], rules: LabelRules, top: number): SkillProgress {
  const measured = rounds.filter((r) => r.timing?.calibrated).sort((a, b) => doneAt(a) - doneAt(b));
  const latest = measured[measured.length - 1] ?? null;
  const step = latest?.step ?? null;
  const last = measured.filter((r) => r.step === step).slice(-rules.timingRounds);
  const steady = last.length >= rules.timingRounds
    && last.every((r) => Math.abs(r.timing?.medianMs ?? Infinity) <= rules.timingMedianMs && (r.timing?.spreadMs ?? Infinity) <= rules.timingSpreadMs)
    && new Set(last.map((r) => localDay(doneAt(r)))).size >= rules.timingDays;
  const label: ProgressLabel = steady
    ? step !== null && step >= top ? 'ready_for_review' : 'steady'
    : measured.length >= rules.timingRounds ? 'practising' : 'exploring';
  const any = [...rounds].sort((a, b) => doneAt(a) - doneAt(b)).pop();
  return {
    skill,
    kind: 'timing',
    label,
    opportunities: measured.length,
    correct: null,
    step,
    lastPractised: any ? new Date(doneAt(any)).toISOString() : null,
    trend: null,
    timingConfidence: measured.length > 0 ? 'calibrated' : 'not_calibrated',
  };
}

/**
 * Progress per skill from a student's rounds (the phone's and the saved ones): one entry per recognition or timing
 * skill that has rounds in the window, recognition first. `topSteps`: each skill's highest step at the student's
 * level (generator.ts topStep of its template).
 */
export function skillProgress(
  rounds: readonly PlayedRound[],
  rules: LabelRules,
  topSteps: Partial<Record<SkillId, number>>,
  now: number,
): SkillProgress[] {
  const inWindow = new Map<string, PlayedRound>();
  for (const r of rounds) if (now - doneAt(r) < rules.windowDays * DAY_MS) inWindow.set(r.id, r);
  const bySkill = new Map<SkillId, PlayedRound[]>();
  for (const r of inWindow.values()) bySkill.set(r.skill, [...(bySkill.get(r.skill) ?? []), r]);
  const out: SkillProgress[] = [];
  for (const [skill, list] of bySkill) {
    const kind = SKILL_KIND[skill];
    if (kind === 'recognition') out.push(recognition(skill, list, rules, topSteps[skill] ?? 1, now));
    else if (kind === 'timing') out.push(timing(skill, list, rules, topSteps[skill] ?? 1));
  }
  const order = (p: SkillProgress) => (p.kind === 'recognition' ? 0 : 1);
  return out.sort((a, b) => order(a) - order(b) || a.skill.localeCompare(b.skill));
}

/** The label rules from the setting, every missing or wrong number taken from the defaults. */
export function labelRules(raw: unknown): LabelRules {
  const out = { ...DEFAULT_LABEL_RULES };
  if (raw && typeof raw === 'object') {
    for (const key of Object.keys(out) as (keyof LabelRules)[]) {
      const v = (raw as Record<string, unknown>)[key];
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) out[key] = v;
    }
  }
  return out;
}
