// What's new, from the info icon above the version line on My profile (docs/DECISIONS.md #406): what changed in each
// version, newest first, in the reader's language. The notes come with the app (src/content/whats-new.json), so the
// newest published entry is the one this phone runs ("You have this"); an entry without a date is not published yet.
// Opening the screen clears the dot on the icon (device only). Shown by student/whats-new.tsx and staff/whats-new.tsx.

import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { Chip } from '@/components/status-chip';
import { RELEASES } from '@/content/whats-new';
import { runningVersion } from '@/lib/app-update';
import { formatDate } from '@/lib/dates';
import { currentRelease, markWhatsNewSeen, releaseNotes, type Release } from '@/lib/whats-new';
import { spacing, useTheme } from '@/theme/use-theme';

/** What's new. */
export function WhatsNewScreen() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const current = currentRelease(RELEASES);
  const running = runningVersion();

  useEffect(() => {
    markWhatsNewSeen(RELEASES);
  }, []);

  /** The short id after the label: what the version line shows for the running one, else the one in the file. */
  function shortId(release: Release): string | null {
    if (release === current && running) {
      if (running.kind === 'update') return running.id;
      if (running.kind === 'web') return running.commit;
    }
    return release.id;
  }

  return (
    <Screen underHeader>
      <Stack.Screen options={{ title: t('whatsNew.title') }} />
      <AppText tone="muted">{t('whatsNew.intro')}</AppText>
      {RELEASES.map((release, index) => {
        const label = t(release.kind === 'installed' ? 'whatsNew.labelInstalled' : 'whatsNew.labelUpdate', {
          version: release.version,
        });
        const id = shortId(release);
        return (
          <Section
            key={`${release.date ?? 'next'}-${release.id ?? index}`}
            icon={release.date === null ? 'newJoiner' : release.kind === 'installed' ? 'download' : 'update'}
            title={id ? `${label} (${id})` : label}
            description={release.date === null ? t('whatsNew.comingNext') : formatDate(release.date)}>
            {release === current ? (
              <View style={styles.chipRow}>
                <Chip label={t('whatsNew.youHaveThis')} tone="success" />
              </View>
            ) : null}
            <View style={styles.list}>
              {releaseNotes(release, i18n.language).map((line) => (
                <View key={line} style={styles.item}>
                  {/* The dot is decoration: a screen reader reads each line on its own. */}
                  <View style={[styles.dot, { backgroundColor: colors.accent }]} aria-hidden />
                  <AppText style={styles.itemText}>{line}</AppText>
                </View>
              ))}
            </View>
          </Section>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chipRow: {
    flexDirection: 'row',
  },
  list: {
    gap: spacing.sm,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 9,
  },
  itemText: {
    flex: 1,
  },
});
