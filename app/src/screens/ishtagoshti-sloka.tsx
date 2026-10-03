// I3 One sloka (Phase 2 slice 6, docs/DECISIONS.md #57): the verse in Devanagari and
// transliteration, the recitation, word meanings, and the temple's own translation and purport in
// the reader's language (or another one, by choice), with the translator's credit; the themes it is
// in; "I have memorised it"; my private notes. Editors also get "Edit sloka" (I12) and can pin it as
// the sloka of the day on a date. Routes: student/ishtagoshti/sloka/[id].tsx and
// staff/ishtagoshti/sloka/[id].tsx.

import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { PlayButton } from '@/components/audio-recorder';
import { Button } from '@/components/button';
import { Checkbox } from '@/components/checkbox';
import { ChoiceGroup } from '@/components/choice-group';
import { IgMarks, openIg, SlokaVerse, type IgArea } from '@/components/ishtagoshti-parts';
import { ListRow } from '@/components/list-row';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { TextField } from '@/components/text-field';
import {
  fetchSlokaPage,
  IG_LANGUAGES,
  inLanguage,
  pinSloka,
  recitationLink,
  saveNote,
  setMemorised,
  unpinDay,
  type IgLanguage,
  type SlokaPage,
} from '@/data/ishtagoshti';
import { formatDayMonthYear, parseDayMonthYear, todayInIndia } from '@/lib/dates';

/** I3 for students or staff. */
export function IshtagoshtiSloka({ area }: { area: IgArea }) {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const slokaId = Number(id);
  const wanted = profile?.language ?? 'en';
  // undefined = loading, null = could not load.
  const [page, setPage] = useState<SlokaPage | 'not_found' | null | undefined>(undefined);
  const [language, setLanguage] = useState<IgLanguage | null>(null);
  /** A signed link to the recitation, for the path it was made for. */
  const [audioLink, setAudioLink] = useState<{ path: string; uri: string | null } | null>(null);
  const [note, setNote] = useState('');
  const [pinDay, setPinDay] = useState(formatDayMonthYear(todayInIndia()));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    const loaded = await fetchSlokaPage(slokaId, profile.id);
    setPage(loaded);
    if (loaded && loaded !== 'not_found') setNote(loaded.note);
  }, [profile, slokaId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const audioPath = page && page !== 'not_found' ? page.sloka.audioPath : null;
  useEffect(() => {
    if (audioPath) void recitationLink(audioPath).then((uri) => setAudioLink({ path: audioPath, uri }));
  }, [audioPath]);
  const audioUri = audioLink && audioLink.path === audioPath ? audioLink.uri : null;

  const header = <Stack.Screen options={{ title: page && page !== 'not_found' ? page.sloka.ref : t('ishtagoshti.slokaTitle') }} />;
  if (page === undefined) {
    return (
      <Screen underHeader>
        {header}
        <LoadingCards />
      </Screen>
    );
  }
  if (page === null || page === 'not_found') {
    return (
      <Screen underHeader centred>
        {header}
        <Notice tone="error" title={page === null ? t('ishtagoshti.loadFailed') : t('ishtagoshti.slokaNotFound')}>
          {page === null ? t('common.networkError') : undefined}
        </Notice>
        <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
      </Screen>
    );
  }

  const { sloka } = page;
  const written = IG_LANGUAGES.filter((l) => sloka.translation[l] || sloka.purport[l]);
  const shownLanguage = language ?? inLanguage(sloka.translation, wanted)?.language ?? written[0] ?? 'en';
  const translation = sloka.translation[shownLanguage];
  const purport = sloka.purport[shownLanguage];
  const meanings = (sloka.wordMeanings ?? '').split('\n').map((l) => l.trim()).filter(Boolean);

  /** Runs a change, shows its result and loads the page again. */
  async function run(change: () => Promise<string | null>, done: string) {
    setBusy(true);
    setMessage(null);
    const errorKey = await change();
    setBusy(false);
    setMessage(errorKey ? { tone: 'error', text: t(errorKey as never) } : { tone: 'success', text: done });
    await load();
  }

  const pin = () => {
    const day = parseDayMonthYear(pinDay);
    if (!day) {
      setMessage({ tone: 'error', text: t('ishtagoshti.pinDateInvalid') });
      return;
    }
    void run(() => pinSloka(sloka.id, day), t('ishtagoshti.pinned', { day: formatDayMonthYear(day) }));
  };

  return (
    <Screen underHeader onRefresh={load}>
      {header}
      <IgMarks sample={sloka.sample} published={sloka.published} />
      <SlokaVerse sloka={sloka} />
      {audioPath ? (
        audioUri ? <PlayButton uri={audioUri} label={t('ishtagoshti.playRecitation')} /> : <AppText tone="muted">{t('ishtagoshti.recitationLoading')}</AppText>
      ) : null}

      {meanings.length > 0 ? (
        <Section icon="syllabus" title={t('ishtagoshti.wordMeanings')}>
          {meanings.map((line, i) => (
            <AppText key={i}>{line}</AppText>
          ))}
        </Section>
      ) : null}

      <Section icon="sloka" title={t('ishtagoshti.translation')}>
        {written.length > 1 ? (
          <ChoiceGroup<IgLanguage>
            chips
            label={t('ishtagoshti.readIn')}
            value={shownLanguage}
            onChange={setLanguage}
            choices={written.map((l) => ({ value: l, label: t(`ishtagoshti.languages.${l}`) }))}
          />
        ) : null}
        {shownLanguage !== wanted && !language ? (
          <AppText variant="small" tone="muted">
            {t('ishtagoshti.shownIn', { language: t(`ishtagoshti.languages.${shownLanguage}`) })}
          </AppText>
        ) : null}
        {translation ? <AppText>{translation}</AppText> : <AppText tone="muted">{t('ishtagoshti.noTranslationIn')}</AppText>}
        {sloka.translator ? (
          <AppText variant="small" tone="muted">
            {t('ishtagoshti.credit', { name: sloka.translator })}
          </AppText>
        ) : null}
      </Section>

      {purport ? (
        <Section icon="library" title={t('ishtagoshti.purport')}>
          {purport.split(/\n{2,}/).map((para, i) => (
            <AppText key={i}>{para.trim()}</AppText>
          ))}
        </Section>
      ) : null}

      {page.themes.length > 0 ? (
        <Section icon="theme" title={t('ishtagoshti.inThemes')}>
          {page.themes.map((theme) => (
            <ListRow key={theme.id} leading="theme" title={theme.title} onPress={() => openIg.theme(area, theme.id)} />
          ))}
        </Section>
      ) : null}

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      <Section icon="memorised" title={t('ishtagoshti.memoriseTitle')}>
        <Checkbox
          label={t('ishtagoshti.memorisedLabel')}
          checked={page.memorised}
          onChange={(on) =>
            !busy && profile
              ? void run(() => setMemorised(profile.id, sloka.id, on), on ? t('ishtagoshti.memorisedDone') : t('ishtagoshti.memorisedUndone'))
              : undefined
          }
        />
      </Section>

      <Section icon="notes" title={t('ishtagoshti.myNotes')} description={t('ishtagoshti.myNotesHint')}>
        <TextField label={t('ishtagoshti.noteLabel')} value={note} onChangeText={setNote} multiline maxLength={2000} />
        <Button
          variant="secondary"
          label={t('ishtagoshti.saveNote')}
          loading={busy}
          disabled={note.trim() === page.note.trim()}
          onPress={() => profile && void run(() => saveNote(profile.id, sloka.id, note), note.trim() ? t('ishtagoshti.noteSaved') : t('ishtagoshti.noteDeleted'))}
        />
      </Section>

      {page.canEdit && area === 'staff' ? (
        <Section icon="edit" title={t('ishtagoshti.editorTitle')}>
          <Button icon="edit" label={t('ishtagoshti.editSloka')} onPress={() => openIg.editSloka(sloka.id)} />
          {sloka.published ? (
            <>
              <AppText variant="label">{t('ishtagoshti.pinTitle')}</AppText>
              <AppText tone="muted">{t('ishtagoshti.pinHint')}</AppText>
              {page.pins.map((day) => (
                <ListRow
                  key={day}
                  leading="today"
                  title={formatDayMonthYear(day)}
                  action={{
                    label: t('ishtagoshti.unpin'),
                    variant: 'secondary',
                    disabled: busy,
                    onPress: () => void run(() => unpinDay(day), t('ishtagoshti.unpinned')),
                  }}
                />
              ))}
              <TextField label={t('ishtagoshti.pinDate')} hint={t('ishtagoshti.pinDateHint')} value={pinDay} onChangeText={setPinDay} maxLength={10} />
              <Button variant="secondary" icon="today" label={t('ishtagoshti.pin')} loading={busy} onPress={pin} />
            </>
          ) : (
            <AppText tone="muted">{t('ishtagoshti.pinNeedsPublished')}</AppText>
          )}
        </Section>
      ) : null}
    </Screen>
  );
}
