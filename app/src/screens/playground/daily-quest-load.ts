// What the Daily Sādhana Quest and Surprise me offer (docs/RHYTHM_PLAYGROUND.md §7.10, §7.15; docs/DECISIONS.md
// #754, #755): the games built so far that the student can play now — an approved template for their level and at
// least one eligible exercise (W1's curriculum guard) — with each game's skill and group; the quest's lines for
// today (lib/today-practice.ts questLines) from the student's progress labels, assignments and today's quest rounds.
// The Daily Mission card loads this module only when it is shown (a separate download on the web), so the home's
// first download stays as it was (#650).

import { addDays, localDate, todayLocal } from '@/lib/dates';
import { PLAYGROUND_GROUPS, type GameRoute, type PlayGroup } from '@/lib/playground-games/catalogue';
import { eligibleExercises, templateFor } from '@/lib/playground/eligibility';
import { topStep } from '@/lib/playground/generator';
import { skillProgress } from '@/lib/playground/labels';
import { roundSeed } from '@/lib/playground/rng';
import type { GameId, RoundMode, SkillId } from '@/lib/playground/types';
import { QUEST_DAYS, questLines, type QuestLine, type QuestOption } from '@/lib/today-practice';

import { loadPlayground, type PlaygroundLoad } from './playground-data';

/** A game the student can play now. */
export type PlayableGame = { game: GameId; skill: SkillId; group: PlayGroup; route: GameRoute };

/** The built games with an approved template for the student's level and at least one eligible exercise. */
export function playableGames(load: PlaygroundLoad): PlayableGame[] {
  const { pack, state } = load;
  if (!pack || !state) return [];
  const ctx = { pack, levelId: state.levelId, levelUpOk: state.settings.levelUpOk, ticked: state.ticked };
  return PLAYGROUND_GROUPS.flatMap(({ group, games }) =>
    games.flatMap((tile): PlayableGame[] => {
      const template = templateFor(pack, tile.game, state.levelId);
      if (!tile.route || !template || eligibleExercises(ctx, tile.game).length === 0) return [];
      return [{ game: tile.game, skill: template.skill, group, route: tile.route }];
    }),
  );
}

/** Games with a round in `mode` started today (the class's day; at or after `since`, ISO), saved or on this phone. */
export function playedToday(load: PlaygroundLoad, mode: RoundMode, today: string, since = ''): GameId[] {
  return [...new Set(load.rounds.filter((r) => r.mode === mode && localDate(r.startedAt) === today && r.startedAt >= since).map((r) => r.game))];
}

/** A quest line with the address of its game. */
export type QuestLineTo = QuestLine & { route: GameRoute };

/** Today's quest. null = the Playground is not on for this student, or nothing is playable yet. */
export function dailyQuest(load: PlaygroundLoad, today: string): QuestLineTo[] | null {
  const { pack, state } = load;
  if (!pack || !state) return null;
  const games = playableGames(load).filter((g) => g.group === 'listening' || g.group === 'rhythm');
  if (games.length === 0) return null;
  const tops: Partial<Record<SkillId, number>> = {};
  for (const g of games) tops[g.skill] = Math.max(tops[g.skill] ?? 1, topStep(templateFor(pack, g.game, state.levelId)));
  const progress = skillProgress(load.rounds, pack.labels, tops, load.at);
  const assigned = state.assignments.filter((a) => a.fromDay <= today && (a.dueDay === null || a.dueDay >= today)).map((a) => a.game);
  const options: QuestOption[] = games.map((g) => {
    const p = progress.find((x) => x.skill === g.skill);
    return {
      game: g.game,
      skill: g.skill,
      group: g.group === 'listening' ? 'listening' : 'rhythm',
      label: p?.label ?? null,
      lastPractised: p?.lastPractised ?? null,
      assigned: assigned.includes(g.game),
    };
  });
  const lines = templateFor(pack, 'daily_quest', state.levelId)?.params.lines;
  const quest = questLines({
    options,
    count: typeof lines === 'number' ? lines : 2,
    seeds: Array.from({ length: QUEST_DAYS }, (_, i) => roundSeed(state.studentId, 'daily_quest', addDays(today, i - QUEST_DAYS + 1), 0)),
    doneToday: playedToday(load, 'daily', today),
  });
  return quest.flatMap((line) => {
    const g = games.find((x) => x.game === line.game);
    return g ? [{ ...line, route: g.route }] : [];
  });
}

/** Loads the Playground and works out today's quest (the Daily Mission card). */
export async function loadDailyQuest(profileId: string): Promise<QuestLineTo[] | null> {
  if (!profileId) return null;
  const load = await loadPlayground(profileId);
  return dailyQuest(load, todayLocal());
}
