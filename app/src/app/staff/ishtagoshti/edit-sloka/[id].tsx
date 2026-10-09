// I12 Sloka editor (Phase 2 slice 6, docs/DECISIONS.md #57), for the facilitator and the
// coordinators marked as Ishtagoshti editors (id 'new' adds one): the reference, the verse in
// Devanagari and transliteration, word meanings (one a line), the translation and purport in
// English, Telugu and Hindi (one language at a time), the translator's credit (empty = the default
// from Settings), "the temple's own text, no BBT" (needed to publish), Published, Sample, the order,
// and the recitation (recorded here or an audio file; uploaded when the sloka is saved). Delete asks
// first. The database checks everything again (guard_ig_sloka, migration 0021).

import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { AudioRecorderPanel, PlayButton } from '@/components/audio-recorder';
import { Button } from '@/components/button';
import { Checkbox } from '@/components/checkbox';
import { ChoiceGroup } from '@/components/choice-group';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { RouteIdGuard } from '@/components/route-id-guard';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { TextField } from '@/components/text-field';
import type { PickedMedia } from '@/data/assessment-files';
import {
  deleteSloka,
  fetchCanEdit,
  fetchSlokaPage,
  IG_LANGUAGES,
  pickRecitation,
  recitationLink,
  recordedRecitation,
  removeRecitation,
  saveSloka,
  uploadRecitation,
  type IgLanguage,
} from '@/data/ishtagoshti';

const EMPTY: Record<IgLanguage, string> = { en: '', te: '', hi: '' };

/** Add or edit one sloka. */
function EditSlokaScreenContent() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const slokaId = isNew ? null : Number(id);

  // undefined = loading; false = may not edit; null = could not load.
  const [ready, setReady] = useState<boolean | null | undefined>(undefined);
  const [ref, setRef] = useState('');
  const [devanagari, setDevanagari] = useState('');
  const [transliteration, setTransliteration] = useState('');
  const [wordMeanings, setWordMeanings] = useState('');
  const [translation, setTranslation] = useState<Record<IgLanguage, string>>(EMPTY);
  const [purport, setPurport] = useState<Record<IgLanguage, string>>(EMPTY);
  const [language, setLanguage] = useState<IgLanguage>('en');
  const [translator, setTranslator] = useState('');
  const [ownText, setOwnText] = useState(false);
  const [published, setPublished] = useState(false);
  const [sample, setSample] = useState(false);
  const [sort, setSort] = useState('0');
  /** The recitation saved on the sloka. */
  const [savedAudio, setSavedAudio] = useState<{ path: string; name: string } | null>(null);
  const [savedAudioUri, setSavedAudioUri] = useState<string | null>(null);
  /** true = the editor removed the saved recitation (it goes when the sloka is saved). */
  const [dropAudio, setDropAudio] = useState(false);
  /** A new recitation picked or recorded, uploaded on Save. */
  const [newAudio, setNewAudio] = useState<PickedMedia | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!profile) return;
    void (async () => {
      if (!(await fetchCanEdit())) {
        setReady(false);
        return;
      }
      if (slokaId === null) {
        setReady(true);
        return;
      }
      const page = await fetchSlokaPage(slokaId, profile.id);
      if (!page || page === 'not_found') {
        setReady(null);
        return;
      }
      const s = page.sloka;
      setRef(s.ref);
      setDevanagari(s.devanagari);
      setTransliteration(s.transliteration);
      setWordMeanings(s.wordMeanings ?? '');
      setTranslation({ en: s.translation.en ?? '', te: s.translation.te ?? '', hi: s.translation.hi ?? '' });
      setPurport({ en: s.purport.en ?? '', te: s.purport.te ?? '', hi: s.purport.hi ?? '' });
      setTranslator(s.translator ?? '');
      setOwnText(s.ownText);
      setPublished(s.published);
      setSample(s.sample);
      setSort(String(s.sort));
      if (s.audioPath) {
        setSavedAudio({ path: s.audioPath, name: s.audioName ?? '' });
        setSavedAudioUri(await recitationLink(s.audioPath));
      }
      setReady(true);
    })();
  }, [profile, slokaId]);

  const title = isNew ? t('ishtagoshti.newSlokaTitle') : t('ishtagoshti.editSlokaTitle');
  const header = <Stack.Screen options={{ title }} />;
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
        <Notice tone="error" title={ready === false ? t('ishtagoshti.errors.not_allowed') : t('ishtagoshti.slokaNotFound')}>
          {ready === false ? t('ishtagoshti.editorsOnly') : t('common.networkError')}
        </Notice>
      </Screen>
    );
  }

  const takeAudio = (result: { file?: PickedMedia; errorKey?: string }) => {
    if (result.file) {
      setNewAudio(result.file);
      setError(null);
    } else if (result.errorKey) {
      setError(t(result.errorKey as never));
    }
  };

  const save = async () => {
    if (!profile) return;
    if (published && !ownText) {
      setError(t('ishtagoshti.errors.own_text_needed'));
      return;
    }
    setSaving(true);
    setError(null);
    let audio = dropAudio ? null : savedAudio;
    let uploaded: string | null = null;
    if (newAudio) {
      const result = await uploadRecitation(profile.id, newAudio);
      if ('errorKey' in result) {
        setSaving(false);
        setError(t(result.errorKey));
        return;
      }
      audio = result;
      uploaded = result.path;
    }
    const result = await saveSloka(slokaId, {
      ref,
      devanagari,
      transliteration,
      wordMeanings,
      translation,
      purport,
      translator,
      ownText,
      published,
      sample,
      sort: Number.isInteger(Number(sort)) ? Number(sort) : 0,
      audio,
    });
    if ('errorKey' in result) {
      if (uploaded) await removeRecitation(uploaded);
      setSaving(false);
      setError(t(result.errorKey));
      return;
    }
    // The old recording is no longer on the sloka: remove the file (if it fails, it only takes space).
    if (savedAudio && audio?.path !== savedAudio.path) await removeRecitation(savedAudio.path);
    setSaving(false);
    router.replace(`/staff/ishtagoshti/sloka/${result.id}`);
  };

  const remove = async () => {
    if (!confirmDelete || slokaId === null) {
      setConfirmDelete(true);
      return;
    }
    setSaving(true);
    const errorKey = await deleteSloka(slokaId);
    if (!errorKey && savedAudio) await removeRecitation(savedAudio.path);
    setSaving(false);
    if (errorKey) {
      setError(t(errorKey));
      return;
    }
    router.dismissTo('/staff/ishtagoshti');
  };

  const languageLabel = t(`ishtagoshti.languages.${language}`);

  return (
    <Screen underHeader>
      {header}
      <Notice tone="info">{t('ishtagoshti.copyrightNote')}</Notice>

      <Section icon="sloka" title={t('ishtagoshti.verse')}>
        <TextField label={t('ishtagoshti.ref')} hint={t('ishtagoshti.refHint')} value={ref} onChangeText={setRef} maxLength={60} />
        <TextField label={t('ishtagoshti.devanagari')} value={devanagari} onChangeText={setDevanagari} multiline maxLength={3000} />
        <TextField
          label={t('ishtagoshti.transliteration')}
          hint={t('ishtagoshti.transliterationHint')}
          value={transliteration}
          onChangeText={setTransliteration}
          multiline
          autoCapitalize="none"
          maxLength={3000}
        />
        <TextField
          label={t('ishtagoshti.wordMeanings')}
          hint={t('ishtagoshti.wordMeaningsHint')}
          value={wordMeanings}
          onChangeText={setWordMeanings}
          multiline
          autoCapitalize="none"
          maxLength={6000}
        />
      </Section>

      <Section icon="language" title={t('ishtagoshti.translationAndPurport')} description={t('ishtagoshti.languagesHint')}>
        <ChoiceGroup<IgLanguage>
          chips
          label={t('ishtagoshti.writingIn')}
          value={language}
          onChange={setLanguage}
          choices={IG_LANGUAGES.map((l) => ({
            value: l,
            label: `${t(`ishtagoshti.languages.${l}`)}${translation[l].trim() ? ' ✓' : ''}`,
          }))}
        />
        <TextField
          label={t('ishtagoshti.translationIn', { language: languageLabel })}
          value={translation[language]}
          onChangeText={(text) => setTranslation({ ...translation, [language]: text })}
          multiline
          maxLength={4000}
        />
        <TextField
          label={t('ishtagoshti.purportIn', { language: languageLabel })}
          value={purport[language]}
          onChangeText={(text) => setPurport({ ...purport, [language]: text })}
          multiline
          maxLength={20000}
        />
        <TextField label={t('ishtagoshti.translator')} hint={t('ishtagoshti.translatorHint')} value={translator} onChangeText={setTranslator} maxLength={100} />
        <Checkbox label={t('ishtagoshti.ownText')} checked={ownText} onChange={setOwnText} />
      </Section>

      <Section icon="audio" title={t('ishtagoshti.recitation')} description={t('ishtagoshti.recitationHint')}>
        {newAudio ? (
          <>
            <AppText>{t('ishtagoshti.newRecitation', { name: newAudio.name })}</AppText>
            <PlayButton uri={newAudio.uri} />
            <Button variant="link" label={t('ishtagoshti.dropNewRecitation')} onPress={() => setNewAudio(null)} />
          </>
        ) : savedAudio && !dropAudio ? (
          <>
            <AppText>{savedAudio.name}</AppText>
            {savedAudioUri ? <PlayButton uri={savedAudioUri} /> : null}
            <Button variant="link" icon="delete" label={t('ishtagoshti.removeRecitation')} onPress={() => setDropAudio(true)} />
          </>
        ) : (
          <>
            {dropAudio ? <AppText tone="muted">{t('ishtagoshti.recitationRemoved')}</AppText> : null}
            <AudioRecorderPanel
              mode="review"
              maxSeconds={600}
              useLabel={t('ishtagoshti.useRecording')}
              onTake={async (take) => takeAudio(await recordedRecitation(take, ref))}
            />
            <Button variant="secondary" icon="file" label={t('ishtagoshti.chooseAudio')} onPress={() => void pickRecitation().then(takeAudio)} />
          </>
        )}
      </Section>

      <Section icon="check" title={t('ishtagoshti.publishing')}>
        <Checkbox label={t('ishtagoshti.publishedLabel')} checked={published} onChange={setPublished} />
        <Checkbox label={t('ishtagoshti.sampleLabel')} checked={sample} onChange={setSample} />
        <TextField label={t('ishtagoshti.sort')} hint={t('ishtagoshti.sortHint')} value={sort} onChangeText={setSort} keyboardType="number-pad" maxLength={6} />
      </Section>

      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button icon="check" label={t('ishtagoshti.saveSloka')} loading={saving} onPress={() => void save()} />
      {!isNew ? (
        <Button
          variant="secondary"
          icon="delete"
          label={confirmDelete ? t('ishtagoshti.confirmDeleteSloka') : t('ishtagoshti.deleteSloka')}
          disabled={saving}
          onPress={() => void remove()}
        />
      ) : null}
      {confirmDelete ? (
        <AppText variant="small" tone="muted">
          {t('ishtagoshti.deleteSlokaHint')}
        </AppText>
      ) : null}
    </Screen>
  );
}

/** Checks the address's id before the screen loads anything (D6-07). */
export default function EditSlokaScreen() {
  return (
    <RouteIdGuard kind="number" allowNew>
      <EditSlokaScreenContent />
    </RouteIdGuard>
  );
}
