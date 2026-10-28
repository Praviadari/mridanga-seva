// Kīrtan Synchronization Challenge (docs/RHYTHM_PLAYGROUND.md §7.14; docs/DECISIONS.md #765). Stage A (listen, find
// the entry) is Kīrtan Companion. Here: step 1 Respond — from the khol's entry, tap the beat with the singer (taps on
// the clip's clock; the round's timing counts only on a tuned phone); step 2 Accompany and step 3 Recover — play on
// your real khol along with the clip (keep the laya, play softly, stay through pauses; come back in without rushing),
// optionally recorded and sent to the facilitator, who rates it (0-3). The app never grades live playing (§12.1).

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { parseGrid, pulseStats, type PulseStats } from '@/lib/playground/beat-grid';
import { createClipPlayer } from '@/lib/playground/clip-player';
import type { Challenge } from '@/lib/playground/types';

import { KirtanPanel, tapDelay, type KirtanTaps } from './kirtan-parts';
import { usePracticeRound } from './use-practice-round';
import { clipSourceOf, MicTake, PracticeFrame, SelfCheck } from './voice-parts';

type Stage = 'respond' | 'accompany' | 'recover';
const STAGE: Record<number, Stage> = { 1: 'respond', 2: 'accompany', 3: 'recover' };

export function KirtanSync() {
  const { t } = useTranslation();
  const game = usePracticeRound('kirtan_sync');
  const [player] = useState(createClipPlayer);
  useEffect(() => () => player.dispose(), [player]);
  const [stats, setStats] = useState<PulseStats | null>(null);
  const [statsFor, setStatsFor] = useState<Challenge | null>(null);
  const [all, setAll] = useState<PulseStats[]>([]);
  if (statsFor !== game.challenge) {
    setStatsFor(game.challenge);
    setStats(null);
    if (game.at === 0) setAll([]);
  }

  const stage = STAGE[game.step] ?? 'accompany';
  const found = game.assetOf(game.challenge);
  const source = clipSourceOf(found?.asset, found?.url ?? null);
  const grid = parseGrid(found?.asset.beatGrid);
  const delay = tapDelay();
  const answer = game.items[game.at]?.a ?? null;

  const respondDone = (taps: KirtanTaps) => {
    if (!grid) return;
    const from = grid.entriesMs[0] ?? 0;
    const s = pulseStats(grid, taps.pulse.filter((ms) => ms - delay.offsetMs >= from - 250), delay.offsetMs);
    setStats(s);
    game.mark({ a: `taps:${s?.taps ?? taps.pulse.length}` });
    if (s) {
      const list = [...all, s];
      setAll(list);
      const avg = (f: (p: PulseStats) => number) => Math.round(list.reduce((sum, p) => sum + f(p), 0) / list.length);
      game.setTiming({ medianMs: avg((p) => p.medianMs), spreadMs: avg((p) => p.spreadMs), calibrated: delay.calibrated, offsetMs: delay.offsetMs });
    }
  };

  return (
    <PracticeFrame
      game={game}
      title={t('playground.game.kirtan_sync.name')}
      instructions={[t('playground.ks.instructions'), t('playground.ks.instructions2')]}
      icon="events"
      onStop={() => player.stop()}
      summary={<AppText>{t('playground.ks.summary', { n: game.items.length })}</AppText>}
    >
      <AppText variant="label">{t(`playground.ks.stage.${stage}`)}</AppText>
      <AppText tone="muted">{t(`playground.ks.stageHelp.${stage}`)}</AppText>
      {stage === 'respond' ? (
        <>
          <KirtanPanel player={player} source={source} grid={grid} hints="sam" pulse entry={false} onDone={respondDone} />
          {stats ? (
            <AppText variant="small" tone="muted">
              {delay.calibrated
                ? t('playground.kc.pulseTuned', { taps: stats.taps, median: stats.medianMs, spread: stats.spreadMs })
                : t('playground.kc.pulseUntuned', { taps: stats.taps })}
            </AppText>
          ) : null}
        </>
      ) : (
        <>
          <KirtanPanel player={player} source={source} grid={grid} hints="none" pulse={false} entry={false} onDone={() => undefined} />
          <SelfCheck question={t('playground.ks.selfCheck')} value={answer} onAnswer={(a) => game.mark({ a })} />
          <MicTake game="kirtan_sync" hint={t('playground.ks.micHint')} />
        </>
      )}
      {stage === 'respond' && !game.marked ? <Button variant="link" label={t('playground.kc.skip')} onPress={() => game.mark({ a: 'none' })} /> : null}
    </PracticeFrame>
  );
}
