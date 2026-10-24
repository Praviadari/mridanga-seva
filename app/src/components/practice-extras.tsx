// Practice extras on S5 Practice tools (docs/DECISIONS.md #490-#492; the milestones are in practice-parts.tsx):
// - SilentFields: silent bars / cycles, the inner-time trainer: play N, then M without sound, round again (#490).
// - LayaChoice: layakari, barabar / dugun / tigun / chaugun in the taal player (#491).
// - KartalFields: the kartal layer under the taal, with its own volume (#492).

import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { LAYAS, SILENT_CHOICES, type Laya } from '@/lib/practice-pattern';
import { spacing } from '@/theme/use-theme';

import { AppText } from './app-text';
import { Checkbox } from './checkbox';
import { ChoiceGroup } from './choice-group';
import { Notice } from './notice';

/** Silent cycles' settings. */
export type SilentSetting = { on: boolean; play: number; mute: number };

/** Props for SilentFields. */
export type SilentFieldsProps = {
  value: SilentSetting;
  onChange: (value: SilentSetting) => void;
  /** 'bars' for the metronome, 'cycles' for the taal player. */
  unit: 'bars' | 'cycles';
  /** False when the loop would be too long at this tempo (lib/practice-pattern.ts silentFits). */
  fits: boolean;
};

/** Silent bars / cycles (#490): a tick box, then how many with sound and how many without. */
export function SilentFields({ value, onChange, unit, fits }: SilentFieldsProps) {
  const { t } = useTranslation();
  const bars = unit === 'bars';
  return (
    <View style={styles.group}>
      <Checkbox label={t(bars ? 'practiceExtras.silentBars' : 'practiceExtras.silentCycles')} checked={value.on} onChange={(on) => onChange({ ...value, on })} />
      {value.on ? (
        <>
          <AppText variant="small" tone="muted">
            {t('practiceExtras.silentHint')}
          </AppText>
          <ChoiceGroup<number>
            segmented
            label={t(bars ? 'practiceExtras.silentPlayBars' : 'practiceExtras.silentPlayCycles')}
            value={value.play}
            onChange={(play) => onChange({ ...value, play })}
            choices={SILENT_CHOICES.map((n) => ({ value: n, label: String(n) }))}
          />
          <ChoiceGroup<number>
            segmented
            label={t(bars ? 'practiceExtras.silentMuteBars' : 'practiceExtras.silentMuteCycles')}
            value={value.mute}
            onChange={(mute) => onChange({ ...value, mute })}
            choices={SILENT_CHOICES.map((n) => ({ value: n, label: String(n) }))}
          />
          {fits ? null : <Notice tone="info">{t('practiceExtras.silentTooLong')}</Notice>}
        </>
      ) : null}
    </View>
  );
}

/** The words of each layakari: name and how many bols a beat. */
const LAYA_KEY = {
  1: 'practiceExtras.laya1',
  2: 'practiceExtras.laya2',
  3: 'practiceExtras.laya3',
  4: 'practiceExtras.laya4',
} as const;

/** Layakari (#491): barabar 1×, dugun 2×, tigun 3×, chaugun 4×. */
export function LayaChoice({ value, onChange }: { value: Laya; onChange: (laya: Laya) => void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.group}>
      <ChoiceGroup<number>
        chips
        label={t('practiceExtras.laya')}
        value={value}
        onChange={(n) => onChange(n as Laya)}
        choices={LAYAS.map((n) => ({ value: n, label: t(LAYA_KEY[n]) }))}
      />
      <AppText variant="small" tone="muted">
        {value === 1 ? t('practiceExtras.layaHint') : t('practiceExtras.layaNow', { count: value })}
      </AppText>
    </View>
  );
}

/** The kartal volumes offered, 0-1. */
export const KARTAL_VOLUMES = [0.25, 0.5, 0.75, 1] as const;

/** Props for KartalFields. */
export type KartalFieldsProps = { on: boolean; onToggle: (on: boolean) => void; volume: number; onVolume: (volume: number) => void };

/** The kartal layer (#492): a tick box and, when on, its volume. */
export function KartalFields({ on, onToggle, volume, onVolume }: KartalFieldsProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.group}>
      <Checkbox label={t('practiceExtras.kartal')} checked={on} onChange={onToggle} />
      {on ? (
        <>
          <AppText variant="small" tone="muted">
            {t('practiceExtras.kartalHint')}
          </AppText>
          <ChoiceGroup<number>
            segmented
            label={t('practiceExtras.kartalVolume')}
            value={volume}
            onChange={onVolume}
            choices={KARTAL_VOLUMES.map((v) => ({ value: v, label: `${Math.round(v * 100)} %` }))}
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: spacing.sm,
  },

});
