// Mantra before practice (docs/DECISIONS.md #405, Praveen 21-10-2026: "i want mridanga mantra to be in some part of app
// so that we can open the mantra to read before practise"): a calm reader, one tap from Practice tools. The mantra in
// large type in Devanagari, Telugu script or Roman transliteration (whichever the Guru wrote; the reader's language's
// script first), its meaning in en/te/hi when given, the source note, a light or dark reading page (kept on this
// device), and the screen kept awake while it is open. Works offline after the first load (data/mantras.ts keeps a
// copy). The text is only the Guru's (or an Ishtagoshti editor's), typed in the app: editors get Add / Edit here
// (staff/mantras/[id]). Routes: student/mantra.tsx, staff/mantra.tsx.

import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { ChoiceGroup } from '@/components/choice-group';
import { EmptyState } from '@/components/empty-state';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { fetchCanEdit } from '@/data/ishtagoshti';
import {
  fetchMantras,
  firstScript,
  MANTRA_LANGUAGES,
  savedMantras,
  scriptsOf,
  type Mantra,
  type MantraLanguage,
  type MantraList,
  type MantraScript,
} from '@/data/mantras';
import { goBackOr } from '@/lib/go-back';
import { readLocal, writeLocal } from '@/lib/local-storage';
import { radius, spacing, useTheme } from '@/theme/use-theme';

/** The reading page's own colours: warm paper or a dark page, the same on every phone. */
const PAGE = {
  light: { background: '#FBF5E6', text: '#2B2218', muted: '#6B5B45', line: '#E3D3AE' },
  dark: { background: '#17130F', text: '#F3E8CF', muted: '#BBA987', line: '#3A3026' },
} as const;

type PageMode = keyof typeof PAGE;
const MODE_KEY = 'mantraReaderMode';

function savedMode(): PageMode | null {
  const value = readLocal(MODE_KEY);
  return value === 'light' || value === 'dark' ? value : null;
}

/** Props for MantraReader. */
export type MantraReaderProps = { area: 'student' | 'staff' | 'waiting' };

/** The mantra reader. */
export function MantraReader({ area }: MantraReaderProps) {
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const { profile } = useAuth();
  const language = profile?.language ?? 'en';
  const [list, setList] = useState<MantraList>(() => ({ mantras: savedMantras(), saved: true }));
  const [canEdit, setCanEdit] = useState(false);
  const [chosenId, setChosenId] = useState<number | null>(null);
  const [script, setScript] = useState<MantraScript | null>(null);
  const [meaningIn, setMeaningIn] = useState<MantraLanguage | null>(null);
  const [mode, setMode] = useState<PageMode>(() => savedMode() ?? (isDark ? 'dark' : 'light'));

  const load = useCallback(async () => {
    const [loaded, editor] = await Promise.all([fetchMantras(), area === 'staff' ? fetchCanEdit() : Promise.resolve(false)]);
    setList(loaded);
    setCanEdit(editor);
  }, [area]);

  // Load on focus; the screen stays awake while the mantra is read.
  useFocusEffect(
    useCallback(() => {
      void load();
      const tag = 'mantra-reader';
      activateKeepAwakeAsync(tag).catch(() => undefined);
      return () => {
        deactivateKeepAwake(tag).catch(() => undefined);
      };
    }, [load]),
  );

  const shown = list.mantras.filter((m) => m.active || canEdit);
  const mantra: Mantra | null = shown.find((m) => m.id === chosenId) ?? shown[0] ?? null;
  const scripts = mantra ? scriptsOf(mantra) : [];
  const shownScript = mantra ? (script && scripts.includes(script) ? script : firstScript(mantra, language)) : null;
  const meanings = mantra ? MANTRA_LANGUAGES.filter((l) => mantra.meaning[l]) : [];
  const shownMeaning: MantraLanguage | null =
    meaningIn && meanings.includes(meaningIn) ? meaningIn : meanings.includes(language as MantraLanguage) ? (language as MantraLanguage) : meanings[0] ?? null;
  const page = PAGE[mode];

  const chooseMode = (next: PageMode) => {
    setMode(next);
    writeLocal(MODE_KEY, next);
  };

  return (
    <Screen underHeader>
      <Stack.Screen options={{ title: t('mantras.title') }} />
      {list.saved && shown.length > 0 ? <Notice tone="info">{t('mantras.savedCopy')}</Notice> : null}

      {!mantra ? (
        <>
          <EmptyState icon="sloka" title={t('mantras.none')} body={canEdit ? t('mantras.noneEditor') : undefined} />
          {canEdit ? <Button icon="add" label={t('mantras.add')} onPress={() => router.push({ pathname: '/staff/mantras/[id]', params: { id: 'new' } })} /> : null}
        </>
      ) : (
        <>
          {shown.length > 1 ? (
            <ChoiceGroup<number>
              chips
              label={t('mantras.which')}
              value={mantra.id}
              onChange={setChosenId}
              choices={shown.map((m) => ({ value: m.id, label: m.title }))}
            />
          ) : null}
          {scripts.length > 1 ? (
            <ChoiceGroup<MantraScript>
              segmented
              label={t('mantras.script')}
              value={shownScript}
              onChange={setScript}
              choices={scripts.map((s) => ({ value: s, label: t(`mantras.scripts.${s}`) }))}
            />
          ) : null}

          <View style={[styles.page, { backgroundColor: page.background, borderColor: page.line }]}>
            <AppText variant="subtitle" style={[styles.center, { color: page.muted }]}>
              {mantra.title}
            </AppText>
            {shownScript ? (
              <AppText selectable style={[styles.mantra, { color: page.text }]} lang={shownScript === 'devanagari' ? 'sa' : shownScript === 'telugu' ? 'te' : 'sa-Latn'}>
                {mantra.text[shownScript]}
              </AppText>
            ) : null}
            {shownMeaning ? (
              <View style={[styles.meaning, { borderTopColor: page.line }]}>
                <AppText variant="label" style={{ color: page.muted }}>
                  {t('mantras.meaning')}
                </AppText>
                <AppText selectable style={[styles.meaningText, { color: page.text }]} lang={shownMeaning}>
                  {mantra.meaning[shownMeaning]}
                </AppText>
              </View>
            ) : null}
            {mantra.source ? (
              <AppText variant="small" style={[styles.center, { color: page.muted }]}>
                {t('mantras.source', { source: mantra.source })}
              </AppText>
            ) : null}
          </View>

          {meanings.length > 1 ? (
            <ChoiceGroup<MantraLanguage>
              segmented
              label={t('mantras.meaningIn')}
              value={shownMeaning}
              onChange={setMeaningIn}
              choices={meanings.map((l) => ({ value: l, label: t(`mantras.languages.${l}`) }))}
            />
          ) : null}
          <ChoiceGroup<PageMode>
            segmented
            label={t('mantras.page')}
            value={mode}
            onChange={chooseMode}
            choices={[
              { value: 'light', label: t('mantras.pageLight') },
              { value: 'dark', label: t('mantras.pageDark') },
            ]}
          />
          {!mantra.active ? <Notice tone="info">{t('mantras.switchedOff')}</Notice> : null}
          {canEdit ? (
            <View style={styles.editor}>
              <Button variant="secondary" icon="edit" label={t('mantras.edit')} onPress={() => router.push({ pathname: '/staff/mantras/[id]', params: { id: String(mantra.id) } })} />
              <Button variant="secondary" icon="add" label={t('mantras.addAnother')} onPress={() => router.push({ pathname: '/staff/mantras/[id]', params: { id: 'new' } })} />
            </View>
          ) : null}
          <Button icon="practice" label={t('mantras.toPractice')} onPress={() => goBackOr(area === 'staff' ? '/staff/practice' : area === 'waiting' ? '/waiting/practice' : '/student/practice')} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: {
    borderWidth: 1,
    borderRadius: radius,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  center: {
    textAlign: 'center',
  },
  mantra: {
    fontSize: 26,
    lineHeight: 44,
    textAlign: 'center',
  },
  meaning: {
    borderTopWidth: 1,
    paddingTop: spacing.md,
    gap: spacing.xs,
  },
  meaningText: {
    fontSize: 18,
    lineHeight: 28,
  },
  editor: {
    gap: spacing.sm,
  },
});
