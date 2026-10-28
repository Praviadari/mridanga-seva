// Kīrtan Companion (docs/RHYTHM_PLAYGROUND.md §7.7, stage A of §7.14; docs/DECISIONS.md #765): listen to a kīrtan,
// tap its pulse, and tap where the khol should start. The entry is found when the tap is within half a beat of an
// annotated entry (recognition, saved as right or not); the pulse taps are practice only and show their timing
// only on a tuned phone. Afterwards the entry is shown and can be heard again from a cycle before it. Steps: beat
// hints on every beat → only at sam → none. The clip never starts by itself.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Notice } from '@/components/notice';
import { entryResult, parseGrid, pulseStats, replayFrom, type EntryResult, type PulseStats } from '@/lib/playground/beat-grid';
import { createClipPlayer } from '@/lib/playground/clip-player';
import type { Challenge } from '@/lib/playground/types';

import { KirtanPanel, tapDelay, type Hints, type KirtanTaps } from './kirtan-parts';
import { usePracticeRound } from './use-practice-round';
import { clipSourceOf, PracticeFrame } from './voice-parts';

const HINTS: Record<number, Hints> = { 1: 'all', 2: 'sam', 3: 'none' };

export function KirtanCompanion() {
  const { t } = useTranslation();
  const game = usePracticeRound('kirtan_companion');
  const [player] = useState(createClipPlayer);
  useEffect(() => () => player.dispose(), [player]);
  const [result, setResult] = useState<{ entry: EntryResult | null; pulse: PulseStats | null; tapped: boolean } | null>(null);
  const [resultFor, setResultFor] = useState<Challenge | null>(null);
  if (resultFor !== game.challenge) {
    setResultFor(game.challenge);
    setResult(null);
  }

  const found = game.assetOf(game.challenge);
  const source = clipSourceOf(found?.asset, found?.url ?? null);
  const grid = parseGrid(found?.asset.beatGrid);
  const delay = tapDelay();

  const finish = (taps: KirtanTaps) => {
    if (!grid) return;
    const entry = taps.entry !== null ? entryResult(grid, taps.entry, delay.offsetMs) : null;
    const pulse = pulseStats(grid, taps.pulse, delay.offsetMs);
    setResult({ entry, pulse, tapped: taps.entry !== null });
    if (taps.entry !== null) game.mark({ a: String(Math.round(taps.entry - delay.offsetMs)), ok: entry?.found ?? false });
  };

  const right = game.items.filter((i) => i.ok).length;
  return (
    <PracticeFrame
      game={game}
      title={t('playground.game.kirtan_companion.name')}
      instructions={[t('playground.kc.instructions'), t('playground.kc.instructions2')]}
      icon="drum"
      onStop={() => player.stop()}
      summary={<AppText>{t('playground.kc.summary', { found: right, total: game.items.length })}</AppText>}
    >
      <AppText variant="label">{t(`playground.kc.hints.${HINTS[game.step] ?? 'none'}`)}</AppText>
      <KirtanPanel player={player} source={source} grid={grid} hints={HINTS[game.step] ?? 'none'} pulse entry onDone={finish} />
      {result ? (
        <>
          {!result.tapped ? <Notice tone="info">{t('playground.kc.noEntryTap')}</Notice> : null}
          {result.entry ? (
            <Notice tone={result.entry.found ? 'success' : 'info'}>
              {result.entry.found
                ? t('playground.kc.found')
                : t(result.entry.errorMs < 0 ? 'playground.kc.early' : 'playground.kc.late', { seconds: (Math.abs(result.entry.errorMs) / 1000).toFixed(1) })}
            </Notice>
          ) : null}
          {grid && grid.entriesMs.length > 0 && source ? (
            <Button
              variant="secondary"
              icon="listen"
              label={t('playground.kc.hearEntry')}
              onPress={() => {
                game.replayed();
                void player.play(source, replayFrom(grid, result.entry?.entryMs ?? grid.entriesMs[0]));
              }}
            />
          ) : null}
          {result.pulse ? (
            <AppText variant="small" tone="muted">
              {delay.calibrated
                ? t('playground.kc.pulseTuned', { taps: result.pulse.taps, median: result.pulse.medianMs, spread: result.pulse.spreadMs })
                : t('playground.kc.pulseUntuned', { taps: result.pulse.taps })}
            </AppText>
          ) : null}
          {!game.marked ? (
            <Button variant="link" label={t('playground.kc.skip')} onPress={() => game.mark({ a: 'none' })} />
          ) : null}
        </>
      ) : null}
    </PracticeFrame>
  );
}
