// I11 Theme editor (Phase 2 slice 6, docs/DECISIONS.md #57), for the facilitator and the
// coordinators marked as Ishtagoshti editors (id 'new' adds one): the title, the introduction,
// questions to think about (one a line), its slokas in order (add, move up or down, take out),
// Published, Sample and the order among themes. Delete asks first; the slokas stay. The weekly
// theme calendar of I11 comes with the sessions (I6, a later slice).

import { router, Stack, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Checkbox } from '@/components/checkbox';
import { ListRow } from '@/components/list-row';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { TextField } from '@/components/text-field';
import { deleteTheme, fetchCanEdit, fetchSlokas, fetchThemes, firstLine, saveTheme, type Sloka } from '@/data/ishtagoshti';
import { spacing } from '@/theme/use-theme';

/** Add or edit one theme. */
export default function EditThemeScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const themeId = isNew ? null : Number(id);

  // undefined = loading; false = may not edit; null = could not load.
  const [ready, setReady] = useState<boolean | null | undefined>(undefined);
  const [slokas, setSlokas] = useState<Sloka[]>([]);
  const [title, setTitle] = useState('');
  const [intro, setIntro] = useState('');
  const [questions, setQuestions] = useState('');
  const [published, setPublished] = useState(false);
  const [sample, setSample] = useState(false);
  const [sort, setSort] = useState('0');
  const [chosen, setChosen] = useState<number[]>([]);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    void (async () => {
      if (!(await fetchCanEdit())) {
        setReady(false);
        return;
      }
      const [all, themes] = await Promise.all([fetchSlokas(), fetchThemes()]);
      if (!all || !themes) {
        setReady(null);
        return;
      }
      setSlokas(all);
      if (themeId !== null) {
        const theme = themes.find((th) => th.id === themeId);
        if (!theme) {
          setReady(null);
          return;
        }
        setTitle(theme.title);
        setIntro(theme.intro ?? '');
        setQuestions(theme.questions ?? '');
        setPublished(theme.published);
        setSample(theme.sample);
        setSort(String(theme.sort));
        setChosen(theme.slokaIds);
      }
      setReady(true);
    })();
  }, [themeId]);

  const byId = useMemo(() => new Map(slokas.map((s) => [s.id, s])), [slokas]);
  const addable = useMemo(() => {
    const query = search.trim().toLowerCase();
    return slokas
      .filter((s) => !chosen.includes(s.id))
      .filter((s) => !query || `${s.ref} ${s.transliteration}`.toLowerCase().includes(query))
      .slice(0, 12);
  }, [slokas, chosen, search]);

  const header = <Stack.Screen options={{ title: isNew ? t('ishtagoshti.newThemeTitle') : t('ishtagoshti.editThemeTitle') }} />;
  if (ready === undefined) {
    return (
      <Screen underHeader>
        {header}
        <LoadingCards />
      </Screen>
    );
  }
  if (ready !== true) {
    return (
      <Screen underHeader centred>
        {header}
        <Notice tone="error" title={ready === false ? t('ishtagoshti.errors.not_allowed') : t('ishtagoshti.themeNotFound')}>
          {ready === false ? t('ishtagoshti.editorsOnly') : t('common.networkError')}
        </Notice>
      </Screen>
    );
  }

  const move = (index: number, by: -1 | 1) => {
    const next = [...chosen];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item);
    setChosen(next);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    const result = await saveTheme(themeId, {
      title,
      intro,
      questions,
      published,
      sample,
      sort: Number.isInteger(Number(sort)) ? Number(sort) : 0,
      slokaIds: chosen,
    });
    setSaving(false);
    if ('errorKey' in result) {
      setError(t(result.errorKey));
      return;
    }
    router.replace(`/staff/ishtagoshti/theme/${result.id}` as Href);
  };

  const remove = async () => {
    if (!confirmDelete || themeId === null) {
      setConfirmDelete(true);
      return;
    }
    setSaving(true);
    const errorKey = await deleteTheme(themeId);
    setSaving(false);
    if (errorKey) {
      setError(t(errorKey));
      return;
    }
    router.dismissTo('/staff/ishtagoshti' as Href);
  };

  return (
    <Screen underHeader>
      {header}
      <Section icon="theme" title={t('ishtagoshti.themeFields')}>
        <TextField label={t('ishtagoshti.themeName')} value={title} onChangeText={setTitle} maxLength={80} />
        <TextField label={t('ishtagoshti.introLabel')} hint={t('ishtagoshti.introHint')} value={intro} onChangeText={setIntro} multiline maxLength={4000} />
        <TextField
          label={t('ishtagoshti.questions')}
          hint={t('ishtagoshti.questionsEditHint')}
          value={questions}
          onChangeText={setQuestions}
          multiline
          maxLength={4000}
        />
      </Section>

      <Section icon="sloka" title={t('ishtagoshti.slokasInTheme', { count: chosen.length })} description={t('ishtagoshti.themeSlokasHint')}>
        {chosen.length === 0 ? <AppText tone="muted">{t('ishtagoshti.themeEmpty')}</AppText> : null}
        {chosen.map((sid, index) => {
          const s = byId.get(sid);
          return (
            <View key={sid} style={styles.item}>
              <ListRow
                leading="sloka"
                title={`${index + 1}. ${s?.ref ?? sid}`}
                details={[s ? firstLine(s) : '', s && !s.published ? t('ishtagoshti.draft') : ''].filter(Boolean)}
              />
              <View style={styles.moves}>
                <Button variant="link" icon="up" label={t('ishtagoshti.moveUp')} disabled={index === 0} onPress={() => move(index, -1)} />
                <Button variant="link" icon="down" label={t('ishtagoshti.moveDown')} disabled={index === chosen.length - 1} onPress={() => move(index, 1)} />
                <Button variant="link" label={t('ishtagoshti.takeOut')} onPress={() => setChosen(chosen.filter((c) => c !== sid))} />
              </View>
            </View>
          );
        })}
        <TextField label={t('ishtagoshti.addToTheme')} value={search} onChangeText={setSearch} autoCapitalize="none" autoCorrect={false} />
        {addable.map((s) => (
          <ListRow
            key={s.id}
            title={s.ref}
            details={[firstLine(s)]}
            action={{ label: t('ishtagoshti.add'), variant: 'secondary', onPress: () => setChosen([...chosen, s.id]) }}
          />
        ))}
      </Section>

      <Section icon="check" title={t('ishtagoshti.publishing')}>
        <Checkbox label={t('ishtagoshti.themePublishedLabel')} checked={published} onChange={setPublished} />
        <Checkbox label={t('ishtagoshti.sampleLabel')} checked={sample} onChange={setSample} />
        <TextField label={t('ishtagoshti.sort')} hint={t('ishtagoshti.sortHint')} value={sort} onChangeText={setSort} keyboardType="number-pad" maxLength={6} />
      </Section>

      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button icon="check" label={t('ishtagoshti.saveTheme')} loading={saving} onPress={() => void save()} />
      {!isNew ? (
        <Button
          variant="secondary"
          icon="delete"
          label={confirmDelete ? t('ishtagoshti.confirmDeleteTheme') : t('ishtagoshti.deleteTheme')}
          disabled={saving}
          onPress={() => void remove()}
        />
      ) : null}
      {confirmDelete ? (
        <AppText variant="small" tone="muted">
          {t('ishtagoshti.deleteThemeHint')}
        </AppText>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  item: { gap: spacing.xs },
  moves: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
});
