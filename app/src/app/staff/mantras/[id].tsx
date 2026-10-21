// Add or edit a mantra read before practice (docs/DECISIONS.md #405; id 'new' adds one), for the Guru and Ishtagoshti
// editors: the title; the mantra in Devanagari, Telugu script and/or Roman transliteration (at least one); the meaning
// in English, Telugu and Hindi (optional); a source note; the order; whether students see it. Delete asks first. The
// text is typed or pasted by the editor: the app ships none. The database checks everything again
// (guard_practice_mantra, supabase/migrations/0052_practice_more.sql). Opened from the mantra reader (staff/mantra).

import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Checkbox } from '@/components/checkbox';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { RouteIdGuard } from '@/components/route-id-guard';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { TextField } from '@/components/text-field';
import { fetchCanEdit } from '@/data/ishtagoshti';
import {
  deleteMantra,
  fetchMantra,
  MANTRA_LANGUAGES,
  MANTRA_MEANING_MAX,
  MANTRA_SCRIPTS,
  MANTRA_SOURCE_MAX,
  MANTRA_TEXT_MAX,
  MANTRA_TITLE_MAX,
  saveMantra,
  type Mantra,
  type MantraLanguage,
  type MantraScript,
} from '@/data/mantras';

const EMPTY_TEXT: Record<MantraScript, string> = { devanagari: '', telugu: '', roman: '' };
const EMPTY_MEANING: Record<MantraLanguage, string> = { en: '', te: '', hi: '' };

/** Add or edit one mantra. */
function MantraEditScreenContent() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const mantraId = isNew ? null : Number(id);

  const [loaded, setLoaded] = useState<Mantra | null | undefined>(isNew ? null : undefined);
  const [canEdit, setCanEdit] = useState<boolean | undefined>(undefined);
  const [title, setTitle] = useState('');
  const [text, setText] = useState(EMPTY_TEXT);
  const [meaning, setMeaning] = useState(EMPTY_MEANING);
  const [source, setSource] = useState('');
  const [sort, setSort] = useState('0');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    void fetchCanEdit().then(setCanEdit);
    if (mantraId === null) return;
    void fetchMantra(mantraId).then((m) => {
      setLoaded(m);
      if (!m) return;
      setTitle(m.title);
      setText({ devanagari: m.text.devanagari ?? '', telugu: m.text.telugu ?? '', roman: m.text.roman ?? '' });
      setMeaning({ en: m.meaning.en ?? '', te: m.meaning.te ?? '', hi: m.meaning.hi ?? '' });
      setSource(m.source ?? '');
      setSort(String(m.sort));
      setActive(m.active);
    });
  }, [mantraId]);

  const screenTitle = isNew ? t('mantras.newTitle') : t('mantras.editTitle');
  if ((!isNew && loaded === undefined) || canEdit === undefined) {
    return (
      <Screen underHeader>
        <Stack.Screen options={{ title: screenTitle }} />
        <LoadingCards />
      </Screen>
    );
  }
  if ((!isNew && loaded === null) || !canEdit) {
    return (
      <Screen underHeader centred>
        <Stack.Screen options={{ title: screenTitle }} />
        <Notice tone="error" title={!canEdit ? t('mantras.errors.not_allowed') : t('mantras.notFound')} />
      </Screen>
    );
  }

  const save = async () => {
    if (!title.trim()) {
      setError(t('mantras.errors.mantra_title_invalid'));
      return;
    }
    if (!MANTRA_SCRIPTS.some((s) => text[s].trim())) {
      setError(t('mantras.errors.mantra_text_required'));
      return;
    }
    setSaving(true);
    setError(null);
    const result = await saveMantra(mantraId, {
      title,
      text: { devanagari: text.devanagari, telugu: text.telugu, roman: text.roman },
      meaning: { en: meaning.en, te: meaning.te, hi: meaning.hi },
      source,
      sort: Number.isInteger(Number(sort)) ? Number(sort) : 0,
      active,
    });
    setSaving(false);
    if ('errorKey' in result) {
      setError(t(result.errorKey));
      return;
    }
    router.dismissTo('/staff/mantra');
  };

  const remove = async () => {
    if (!confirmDelete || mantraId === null) {
      setConfirmDelete(true);
      return;
    }
    setSaving(true);
    const errorKey = await deleteMantra(mantraId);
    setSaving(false);
    if (errorKey) {
      setError(t(errorKey));
      return;
    }
    router.dismissTo('/staff/mantra');
  };

  return (
    <Screen underHeader>
      <Stack.Screen options={{ title: screenTitle }} />
      <Notice tone="info">{t('mantras.editorHint')}</Notice>
      <Section icon="sloka" title={t('mantras.textTitle')}>
        <TextField label={t('mantras.titleField')} hint={t('mantras.titleHint')} value={title} onChangeText={setTitle} maxLength={MANTRA_TITLE_MAX} />
        {MANTRA_SCRIPTS.map((s) => (
          <TextField
            key={s}
            label={t(`mantras.scripts.${s}`)}
            value={text[s]}
            onChangeText={(value) => setText({ ...text, [s]: value })}
            multiline
            maxLength={MANTRA_TEXT_MAX}
            autoCapitalize="none"
          />
        ))}
        <AppText variant="small" tone="muted">
          {t('mantras.scriptsHint')}
        </AppText>
      </Section>
      <Section icon="language" title={t('mantras.meaning')}>
        {MANTRA_LANGUAGES.map((l) => (
          <TextField
            key={l}
            label={t(`mantras.languages.${l}`)}
            value={meaning[l]}
            onChangeText={(value) => setMeaning({ ...meaning, [l]: value })}
            multiline
            maxLength={MANTRA_MEANING_MAX}
          />
        ))}
      </Section>
      <Section icon="settings" title={t('mantras.more')}>
        <TextField label={t('mantras.sourceField')} hint={t('mantras.sourceHint')} value={source} onChangeText={setSource} maxLength={MANTRA_SOURCE_MAX} />
        <TextField label={t('mantras.sort')} hint={t('mantras.sortHint')} value={sort} onChangeText={setSort} keyboardType="number-pad" />
        <Checkbox label={t('mantras.active')} checked={active} onChange={setActive} />
      </Section>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button icon="check" label={t('mantras.save')} loading={saving} onPress={() => void save()} />
      {!isNew ? (
        <Button
          variant="secondary"
          icon="delete"
          label={confirmDelete ? t('mantras.confirmDelete') : t('mantras.delete')}
          disabled={saving}
          onPress={() => void remove()}
        />
      ) : null}
    </Screen>
  );
}

/** Checks the address's id before the screen loads anything (D6-07). */
export default function MantraEditScreen() {
  return (
    <RouteIdGuard kind="number" allowNew>
      <MantraEditScreenContent />
    </RouteIdGuard>
  );
}
