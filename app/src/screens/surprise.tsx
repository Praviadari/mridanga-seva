// Surprise me, a Rhythm Playground mode (docs/RHYTHM_PLAYGROUND.md §7.15, §8.6 rule 5; docs/DECISIONS.md #755): three
// challenges from three different games the student can play now, no skill twice in a row and not the same games as
// the last surprise when others exist (W1's pickDailyGames), from a generator seeded with student + day + how many
// surprises today. Each line opens its game with a one-challenge round saved as a Surprise round; back here the
// line is ticked. Nothing plays by itself. The student can switch Surprise me off (and on) here; a facilitator can
// too (play_student_settings.surprise).

import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Checkbox } from '@/components/checkbox';
import { ListRow } from '@/components/list-row';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { GameShell } from '@/components/playground/game-shell';
import { todayLocal } from '@/lib/dates';
import { realSoundsReady } from '@/lib/khol-samples';
import { pickDailyGames } from '@/lib/playground/repeat-guard';
import { makeRng, roundSeed } from '@/lib/playground/rng';
import { leaveGame } from '@/screens/playground/game-parts';
import { playableGames, playedToday, type PlayableGame } from '@/screens/playground/daily-quest-load';
import { loadPlayground, setSurprise, type PlaygroundLoad } from '@/screens/playground/playground-data';

/** Games in one Surprise me. */
export const SURPRISE_GAMES = 3;

/** Today's surprise number `n` (1 = the first): three games, seeded with student + day + n. */
export function surprisePicks(games: readonly PlayableGame[], studentId: string, today: string, n: number): PlayableGame[] {
  const previous =
    n > 1
      ? pickDailyGames(games, [], SURPRISE_GAMES, makeRng(roundSeed(studentId, 'surprise', today, n - 1))).map((o) => o.game)
      : [];
  const picks = pickDailyGames(games, previous, SURPRISE_GAMES, makeRng(roundSeed(studentId, 'surprise', today, n)));
  return picks.flatMap((p) => games.filter((g) => g.game === p.game).slice(0, 1));
}

/** The screen. */
export function Surprise() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const profileId = profile?.id ?? '';
  const [load, setLoad] = useState<PlaygroundLoad | null>(null);
  const [n, setN] = useState(1);
  // Another surprise ticks only what was played since it was asked for.
  const [since, setSince] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void loadPlayground(profileId).then((loaded) => {
        if (live) setLoad(loaded);
      });
      return () => {
        live = false;
      };
    }, [profileId]),
  );

  const today = todayLocal();
  const on = load?.state?.settings.surprise ?? true;
  const games = load ? playableGames(load) : [];
  const picks = load?.state ? surprisePicks(games, load.state.studentId, today, n) : [];
  const done = load ? playedToday(load, 'surprise', today, since) : [];

  const toggle = async (next: boolean) => {
    setSaving(true);
    setError(null);
    const errorKey = await setSurprise(next);
    setSaving(false);
    if (errorKey) {
      setError(t(errorKey));
      return;
    }
    setLoad((l) => (l?.state ? { ...l, state: { ...l.state, settings: { ...l.state.settings, surprise: next } } } : l));
  };

  return (
    <GameShell title={t('playground.surprise')} onExit={leaveGame} testSounds={!realSoundsReady() || Boolean(load?.pack?.placeholders)}>
      {!load ? <LoadingCards /> : null}
      {load && (!load.pack || !load.state) ? <Notice tone="info">{t('playground.round.notReady')}</Notice> : null}
      {load?.offline ? <Notice tone="info">{t('playground.round.offline')}</Notice> : null}
      {load?.state ? (
        <>
          {on ? (
            <>
              <AppText tone="muted">{t('playground.rhythm.surprise.intro')}</AppText>
              {picks.length === 0 ? <Notice tone="info">{t('playground.round.noContent')}</Notice> : null}
              {picks.map((g) => {
                const name = t(`playground.game.${g.game}.name`);
                const ticked = done.includes(g.game);
                return (
                  <ListRow
                    key={g.game}
                    leading={ticked ? 'tick' : 'play'}
                    title={name}
                    details={[ticked ? t('playground.rhythm.surprise.done') : t('playground.rhythm.surprise.one')]}
                    highlight={ticked ? 'confirmed' : undefined}
                    onPress={() => router.push({ pathname: g.route, params: { mode: 'surprise', len: '1' } })}
                  />
                );
              })}
              {picks.length > 0 && picks.every((g) => done.includes(g.game)) ? (
                <>
                  <AppText>{t('playground.rhythm.surprise.allDone')}</AppText>
                  <Button variant="secondary" icon="refresh" label={t('playground.rhythm.surprise.another')} onPress={() => {
                      setN((x) => x + 1);
                      setSince(new Date().toISOString());
                    }}
                  />
                </>
              ) : null}
            </>
          ) : (
            <AppText tone="muted">{t('playground.rhythm.surprise.offNow')}</AppText>
          )}
          <Checkbox label={t('playground.rhythm.surprise.switch')} checked={on} onChange={(next) => !saving && void toggle(next)} />
          {error ? <Notice tone="error">{error}</Notice> : null}
        </>
      ) : null}
    </GameShell>
  );
}
