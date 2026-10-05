// Pieces the Ishtagoshti screens share (Phase 2 slice 6, docs/DECISIONS.md #57): the verse in
// Devanagari and transliteration, a sloka in a list, the Sample / Draft marks, and the links
// between the screens of one area (students and staff each open only their own routes).

import { router, type Href } from 'expo-router';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { firstLine, inLanguage, type Sloka } from '@/data/ishtagoshti';
import { spacing } from '@/theme/use-theme';

import { AppText } from './app-text';
import { ListRow } from './list-row';
import { Chip } from './status-chip';

/** Whose routes a screen opens: '/student/...', '/staff/...' or '/subscriber/...' (public, 0027). */
export type IgArea = 'student' | 'staff' | 'subscriber';

/** Opens a screen of Ishtagoshti in the area. */
export const openIg = {
  home: (area: IgArea) => router.navigate(`/${area}/ishtagoshti` as Href),
  slokas: (area: IgArea) => router.push(`/${area}/ishtagoshti/slokas` as Href),
  sloka: (area: IgArea, id: number) => router.push(`/${area}/ishtagoshti/sloka/${id}` as Href),
  theme: (area: IgArea, id: number) => router.push(`/${area}/ishtagoshti/theme/${id}` as Href),
  editSloka: (id: number | 'new') => router.push(`/staff/ishtagoshti/edit-sloka/${id}` as Href),
  editTheme: (id: number | 'new') => router.push(`/staff/ishtagoshti/edit-theme/${id}` as Href),
};

/** The verse: Devanagari large, the transliteration below it. */
export function SlokaVerse({ sloka, compact }: { sloka: Pick<Sloka, 'devanagari' | 'transliteration'>; compact?: boolean }) {
  return (
    <View style={styles.verse}>
      <AppText style={compact ? styles.devanagariCompact : styles.devanagari} lang="sa">
        {sloka.devanagari}
      </AppText>
      <AppText tone="muted" style={styles.transliteration}>
        {sloka.transliteration}
      </AppText>
    </View>
  );
}

/** "Sample" and "Draft" marks of a sloka or theme. */
export function IgMarks({ sample, published }: { sample: boolean; published: boolean }) {
  const { t } = useTranslation();
  if (!sample && published) return null;
  return (
    <View style={styles.marks}>
      {sample ? <Chip label={t('ishtagoshti.sample')} tone="warning" /> : null}
      {!published ? <Chip label={t('ishtagoshti.draft')} tone="neutral" /> : null}
    </View>
  );
}

/** The words under a sloka in a list: its first line, the start of the translation, its marks. */
export function slokaDetails(t: TFunction, sloka: Sloka, language: string, memorised?: boolean): string[] {
  const translation = inLanguage(sloka.translation, language)?.text ?? '';
  return [
    firstLine(sloka),
    translation.length > 90 ? `${translation.slice(0, 88)}…` : translation,
    [sloka.sample ? t('ishtagoshti.sample') : '', sloka.published ? '' : t('ishtagoshti.draft'), memorised ? t('ishtagoshti.memorisedMark') : '']
      .filter(Boolean)
      .join(' · '),
  ].filter(Boolean);
}

/** One sloka in a list; opens I3. */
export function SlokaRow({ area, sloka, language, memorised }: { area: IgArea; sloka: Sloka; language: string; memorised?: boolean }) {
  const { t } = useTranslation();
  return (
    <ListRow leading="sloka" title={sloka.ref} details={slokaDetails(t, sloka, language, memorised)} onPress={() => openIg.sloka(area, sloka.id)} />
  );
}

const styles = StyleSheet.create({
  verse: { gap: spacing.sm },
  devanagari: { fontSize: 22, lineHeight: 38 },
  devanagariCompact: { fontSize: 19, lineHeight: 32 },
  transliteration: { fontStyle: 'italic' },
  marks: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});
