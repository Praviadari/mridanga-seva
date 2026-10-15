// "Possible duplicate" on Register a student (docs/DECISIONS.md #274, #390): the student records and waiting sign-ups
// that may be the person at the desk (src/lib/duplicates.ts), above Save and on Accept's card, so the desk opens the
// record instead of registering the same person twice. A warning, never a stop: the desk may still save (twins, two
// people with one phone). Nothing is drawn while there is nothing to show.

import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { formatDate } from '@/lib/dates';
import type { PossibleDuplicate } from '@/lib/duplicates';
import { spacing } from '@/theme/use-theme';

import { Button } from './button';
import { Notice } from './notice';

/** Props for PossibleDuplicates. */
export type PossibleDuplicatesProps = {
  matches: readonly PossibleDuplicate[];
  /** 'save' above the form's Save; 'accept' on Accept's card. */
  place: 'save' | 'accept';
};

/** The warning with one line per match and, for a student record, a button that opens it. */
export function PossibleDuplicates({ matches, place }: PossibleDuplicatesProps) {
  const { t } = useTranslation();
  if (matches.length === 0) return null;
  const lines = matches.map((m) => {
    const why = [m.sameNameAndBirth ? t('register.duplicates.sameNameAndBirth') : '', m.samePhone ? t('register.duplicates.samePhone') : '']
      .filter(Boolean)
      .join(', ');
    const since = m.since ? formatDate(m.since) : '';
    const what =
      m.kind === 'student'
        ? t(m.withdrawn ? 'register.duplicates.studentWithdrawn' : 'register.duplicates.student', {
            name: m.fullName,
            rollNo: m.rollNo ?? '',
            centre: m.centre ?? '',
            date: since,
          })
        : t('register.duplicates.signUp', { name: m.fullName, centre: m.centre ?? '', date: since });
    return `• ${what} (${why})`;
  });
  return (
    <View style={styles.block}>
      <Notice tone="warning" announced title={t('register.duplicates.title', { count: matches.length })}>
        {[...lines, t(place === 'accept' ? 'register.duplicates.hintAccept' : 'register.duplicates.hintSave')].join('\n')}
      </Notice>
      {matches
        .filter((m) => m.kind === 'student')
        .map((m) => (
          <Button
            key={m.id}
            variant="link"
            icon="person"
            label={t('register.duplicates.open', { name: m.fullName })}
            onPress={() => router.push({ pathname: '/staff/students/[id]', params: { id: m.id } })}
          />
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: spacing.sm,
  },
});
