// "Play and learn" on Practice tools (docs/DECISIONS.md #470-#474): four tiles to the creative tools, in the look of
// the home screen's quick tiles (design_reference "version 3"): Tap pad (play along on two pads), Which bol? (ear
// quiz), Echo me (call and response) and Learn more (links the Guru keeps); and the drum sound, synthesised or the
// Guru's recorded khol strokes once they are in the app (lib/khol-samples.ts).

import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { applySoundChoice, chooseSound, realSoundsReady, soundChoice, type SoundChoice } from '@/lib/khol-samples';
import type { ModuleTone } from '@/theme/colors';
import { cardRadius, spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { ChoiceGroup } from './choice-group';
import { IconBadge, type IconName } from './icon';
import { Section } from './section';

/** The four tools: their route name, icon, colour and words. */
const TOOLS: { route: 'tap-pad' | 'which-bol' | 'echo-me' | 'learn-more'; icon: IconName; tone: ModuleTone; key: string }[] = [
  { route: 'tap-pad', icon: 'tap', tone: 'orange', key: 'tapPad' },
  { route: 'which-bol', icon: 'listen', tone: 'blue', key: 'whichBol' },
  { route: 'echo-me', icon: 'reply', tone: 'purple', key: 'echo' },
  { route: 'learn-more', icon: 'library', tone: 'green', key: 'learnMore' },
];

/** Props for PlayAndLearn. */
export type PlayAndLearnProps = { area: 'student' | 'staff' | 'me' };

/** The tiles and the drum sound. */
export function PlayAndLearn({ area }: PlayAndLearnProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [sound, setSound] = useState<SoundChoice>(soundChoice);
  const ready = realSoundsReady();

  useEffect(() => {
    void applySoundChoice();
  }, []);

  const go = (route: (typeof TOOLS)[number]['route']) =>
    router.push(area === 'student' ? `/student/${route}` : `/staff/${route}`);

  return (
    <Section icon="drum" title={t('play.title')} description={t('play.intro')}>
      <View style={styles.grid}>
        {TOOLS.map((tool) => (
          <Pressable
            key={tool.route}
            accessibilityRole="button"
            accessibilityLabel={`${t(`${tool.key}.title` as 'tapPad.title')}. ${t(`${tool.key}.tile` as 'tapPad.tile')}`}
            onPress={() => go(tool.route)}
            style={({ pressed }) => [
              styles.tile,
              { backgroundColor: colors.modules[tool.tone].background, borderColor: colors.cardBorder, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <IconBadge name={tool.icon} tone={tool.tone} solid size={44} />
            <AppText variant="label" style={styles.tileText}>
              {t(`${tool.key}.title` as 'tapPad.title')}
            </AppText>
            <AppText variant="small" tone="muted" style={styles.tileText}>
              {t(`${tool.key}.tile` as 'tapPad.tile')}
            </AppText>
          </Pressable>
        ))}
      </View>
      {ready ? (
        <ChoiceGroup<SoundChoice>
          segmented
          label={t('play.sound')}
          value={sound}
          onChange={(next) => {
            setSound(next);
            void chooseSound(next);
          }}
          choices={[
            { value: 'synth', label: t('play.soundSynth') },
            { value: 'real', label: t('play.soundReal') },
          ]}
        />
      ) : (
        <AppText variant="small" tone="muted">
          {t('play.soundComing')}
        </AppText>
      )}
    </Section>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tile: {
    // Two a row on a phone, four on a wide screen.
    flexGrow: 1,
    flexBasis: '45%',
    minWidth: 140,
    minHeight: 120,
    padding: spacing.sm,
    borderRadius: cardRadius,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  tileText: {
    textAlign: 'center',
  },
});
