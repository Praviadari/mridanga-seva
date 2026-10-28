// Upload a sound, or change its details (docs/RHYTHM_PLAYGROUND.md §10.1, §18.3-§18.4; docs/DECISIONS.md #743): id
// 'new' adds one. The kind (stroke, phrase, tempo, kīrtan, instrument, voice, tone); the file (m4a, mp3 or wav,
// at most 15 MB, into the private bucket playground-audio) — or, for a stroke, one the app carries; the licence
// (own, written permission, CC BY, public domain), the performer, where the signed permission is kept (never the
// form itself), the credit for CC BY, the recorded tempo and the instruments heard. The file cannot be changed
// afterwards: a new recording is a new sound. Approving needs the file in the bucket and the licence's details.

import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/app-text';
import { PlayButton } from '@/components/audio-recorder';
import { Button } from '@/components/button';
import { ChoiceGroup } from '@/components/choice-group';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { RouteIdGuard } from '@/components/route-id-guard';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { TextField } from '@/components/text-field';
import { playgroundAudioUrls } from '@/data/playground';
import { addSound, pickSoundFile, saveSoundDetails, type AdminAsset, type PickedSound, type SoundDetails } from '@/data/playground-admin';
import { fileSizeText } from '@/i18n/labels';
import type { AssetKind, PlayAsset } from '@/lib/playground/types';

import { BOL_ID, canEdit, readBpm, readIds } from './content-rules';
import { StatusPanel, useAdminContent } from './parts';

const KINDS: readonly AssetKind[] = ['stroke', 'phrase', 'tempo', 'kirtan', 'instrument', 'voice', 'tone'];
const LICENCES: readonly PlayAsset['licence'][] = ['own', 'permission', 'cc_by', 'public_domain'];

/** The screen: waits for the content, then the form. */
function SoundEditorContent() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const { content, reload } = useAdminContent();
  const row = content && !isNew ? (content.assets.find((a) => String(a.id) === id) ?? null) : null;
  const title = isNew ? t('staffPlayground.sound.newTitle') : t('staffPlayground.sound.editTitle');

  if (content === undefined) {
    return (
      <Screen underHeader>
        <Stack.Screen options={{ title }} />
        <LoadingCards />
      </Screen>
    );
  }
  if (content === null || (!isNew && !row)) {
    return (
      <Screen underHeader centred>
        <Stack.Screen options={{ title }} />
        <Notice tone="error">{content === null ? t('common.networkError') : t('playEngine.errors.contentNotFound')}</Notice>
      </Screen>
    );
  }
  return (
    <Screen underHeader>
      <Stack.Screen options={{ title }} />
      <SoundForm key={row ? `${row.id}-${row.updatedAt}` : 'new'} row={row} />
      {row ? <StatusPanel kind="asset" id={row.id} row={row} filePath={row.path} onChanged={() => void reload()} /> : null}
    </Screen>
  );
}

/** Play for a sound in the bucket (a signed link of an hour, never kept). */
function PlayStored({ path }: { path: string }) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void playgroundAudioUrls([path]).then((links) => {
      if (live) setUri(links[path] ?? null);
    });
    return () => {
      live = false;
    };
  }, [path]);
  return uri ? <PlayButton uri={uri} /> : null;
}

function SoundForm({ row }: { row: AdminAsset | null }) {
  const { t } = useTranslation();
  const editable = canEdit(row, true);
  const [kind, setKind] = useState<AssetKind>(row?.kind ?? 'stroke');
  const [source, setSource] = useState<'file' | 'bundled'>('file');
  const [picked, setPicked] = useState<PickedSound | null>(null);
  const [bundledKey, setBundledKey] = useState('');
  const [licence, setLicence] = useState<PlayAsset['licence']>(row?.licence ?? 'own');
  const [performer, setPerformer] = useState(row?.performer ?? '');
  const [permissionRef, setPermissionRef] = useState(row?.permissionRef ?? '');
  const [credit, setCredit] = useState(row?.credit ?? '');
  const [bpm, setBpm] = useState(row?.bpm !== null && row?.bpm !== undefined ? String(row.bpm) : '');
  const [instruments, setInstruments] = useState((row?.instruments ?? []).join(', '));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tempo = readBpm(bpm);
  const details = (): SoundDetails => ({
    licence,
    performer,
    permissionRef,
    credit,
    bpm: tempo.bpm,
    instruments: instruments.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean),
  });

  const choose = async () => {
    setError(null);
    const result = await pickSoundFile();
    if (!result) return;
    if ('errorKey' in result) setError(t(result.errorKey));
    else setPicked(result);
  };

  const save = async () => {
    if (tempo.problem) {
      setError(t('staffPlayground.sound.bpmProblem'));
      return;
    }
    setSaving(true);
    setError(null);
    if (row) {
      const errorKey = await saveSoundDetails(row.id, details());
      setSaving(false);
      if (errorKey) setError(t(errorKey));
      else router.back();
      return;
    }
    const useBundled = kind === 'stroke' && source === 'bundled';
    const key = readIds(bundledKey)[0] ?? '';
    if (useBundled ? !BOL_ID.test(key) : !picked) {
      setSaving(false);
      setError(t(useBundled ? 'staffPlayground.sound.bundledProblem' : 'staffPlayground.sound.chooseFirst'));
      return;
    }
    const result = await addSound(kind, useBundled ? { bundledKey: key } : { picked: picked as PickedSound }, details());
    setSaving(false);
    if ('errorKey' in result) setError(t(result.errorKey));
    else router.back();
  };

  return (
    <>
      <Section icon="audio" title={t('staffPlayground.sound.fileSection')}>
        {row ? (
          <>
            <AppText>{t(`staffPlayground.sound.kind_${row.kind}`)}</AppText>
            <AppText tone="muted">
              {row.path
                ? [t('staffPlayground.sound.uploaded'), row.bytes ? fileSizeText(t, row.bytes) : null].filter(Boolean).join(' · ')
                : t('staffPlayground.sound.bundled', { key: row.bundledKey ?? '' })}
            </AppText>
            {row.path ? <PlayStored path={row.path} /> : null}
            <AppText variant="small" tone="muted">
              {t('staffPlayground.sound.fileFixed')}
            </AppText>
          </>
        ) : (
          <>
            <ChoiceGroup<AssetKind>
              chips
              label={t('staffPlayground.sound.kind')}
              value={kind}
              onChange={setKind}
              choices={KINDS.map((value) => ({ value, label: t(`staffPlayground.sound.kind_${value}`) }))}
            />
            {kind === 'stroke' ? (
              <ChoiceGroup<'file' | 'bundled'>
                segmented
                accessibilityLabel={t('staffPlayground.sound.source')}
                value={source}
                onChange={setSource}
                choices={[
                  { value: 'file', label: t('staffPlayground.sound.sourceFile') },
                  { value: 'bundled', label: t('staffPlayground.sound.sourceBundled') },
                ]}
              />
            ) : null}
            {kind === 'stroke' && source === 'bundled' ? (
              <TextField label={t('staffPlayground.sound.bundledKey')} hint={t('staffPlayground.sound.bundledKeyHint')} value={bundledKey} onChangeText={setBundledKey} autoCapitalize="none" maxLength={10} />
            ) : (
              <>
                <AppText tone="muted">{t('staffPlayground.sound.fileHint')}</AppText>
                <Button variant="secondary" icon="file" label={picked ? t('staffPlayground.sound.chooseOther') : t('staffPlayground.sound.choose')} onPress={() => void choose()} />
                {picked ? (
                  <>
                    <AppText>{`${picked.file.name} · ${fileSizeText(t, picked.file.size)}`}</AppText>
                    <PlayButton uri={picked.file.uri} />
                  </>
                ) : null}
              </>
            )}
          </>
        )}
      </Section>
      <Section icon="about" title={t('staffPlayground.sound.licenceSection')}>
        <ChoiceGroup<PlayAsset['licence']>
          label={t('staffPlayground.sound.licence')}
          value={licence}
          onChange={(v) => editable && setLicence(v)}
          choices={LICENCES.map((value) => ({ value, label: t(`staffPlayground.sound.licence_${value}`) }))}
        />
        <TextField label={t('staffPlayground.sound.performer')} value={performer} onChangeText={setPerformer} maxLength={120} editable={editable} />
        {licence === 'permission' ? (
          <TextField label={t('staffPlayground.sound.permissionRef')} hint={t('staffPlayground.sound.permissionRefHint')} value={permissionRef} onChangeText={setPermissionRef} maxLength={200} editable={editable} />
        ) : null}
        {licence === 'cc_by' ? <TextField label={t('staffPlayground.sound.credit')} value={credit} onChangeText={setCredit} maxLength={200} editable={editable} /> : null}
        <TextField label={t('staffPlayground.sound.bpm')} hint={t('staffPlayground.sound.bpmHint')} value={bpm} onChangeText={setBpm} kind="decimal" editable={editable} error={tempo.problem ? t('staffPlayground.sound.bpmProblem') : undefined} />
        {kind === 'instrument' || kind === 'kirtan' ? (
          <TextField label={t('staffPlayground.sound.instruments')} hint={t('staffPlayground.sound.instrumentsHint')} value={instruments} onChangeText={setInstruments} autoCapitalize="none" editable={editable} />
        ) : null}
      </Section>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {editable ? <Button icon={row ? 'check' : 'send'} label={row ? t('staffPlayground.saveDraft') : t('staffPlayground.sound.upload')} loading={saving} onPress={() => void save()} /> : null}
    </>
  );
}

/** Checks the address's id before the screen loads anything (D6-07). */
export function SoundEditor() {
  return (
    <RouteIdGuard kind="number" allowNew>
      <SoundEditorContent />
    </RouteIdGuard>
  );
}
