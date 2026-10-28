// One bol of the dictionary (docs/RHYTHM_PLAYGROUND.md §8.1, §18.2; docs/DECISIONS.md #742): id 'new' adds one. The
// plain id (dha for dhā, the form lib/bols.ts plainBol makes and every exercise uses), how the class writes it,
// which hand, the first level, the technique in the teacher's words, open or closed, the bols that sound the same
// (one card) and the close pairs ("hard" distractors), and its recording (a stroke sound of the library). Only an
// approved bol can appear in a challenge; changing an approved one sends it back for approval.

import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { ChoiceGroup } from '@/components/choice-group';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { TextField } from '@/components/text-field';
import { saveBol, type AdminBol, type AdminContent } from '@/data/playground-admin';
import { LEVEL_IDS, levelName } from '@/i18n/labels';
import type { Head } from '@/lib/playground/types';

import { BOL_ID, canEdit, readIds } from './content-rules';
import { StatusPanel, useAdminContent } from './parts';

const HEADS: readonly Head[] = ['dayan', 'baya', 'both'];
type Openness = 'open' | 'closed' | 'unset';

/** The screen: waits for the content, then the form. */
export function BolEditor() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const { content, reload } = useAdminContent();
  const row = content && !isNew ? (content.bols.find((b) => b.id === id) ?? null) : null;
  const title = isNew ? t('staffPlayground.bol.newTitle') : t('staffPlayground.bol.editTitle');

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
      <BolForm key={row ? `${row.id}-${row.updatedAt}` : 'new'} row={row} content={content} />
      {row ? <StatusPanel kind="bol" id={row.id} row={row} onChanged={() => void reload()} /> : null}
    </Screen>
  );
}

function BolForm({ row, content }: { row: AdminBol | null; content: AdminContent }) {
  const { t } = useTranslation();
  const editable = canEdit(row, true);
  const [id, setId] = useState(row?.id ?? '');
  const [written, setWritten] = useState(row?.written ?? '');
  const [head, setHead] = useState<Head>(row?.head ?? 'dayan');
  const [levelId, setLevelId] = useState<number>(row?.levelId ?? 1);
  const [technique, setTechnique] = useState(row?.technique ?? '');
  const [open, setOpen] = useState<Openness>(row?.open === true ? 'open' : row?.open === false ? 'closed' : 'unset');
  const [soundsLike, setSoundsLike] = useState((row?.soundsLike ?? []).join(' '));
  const [closePairs, setClosePairs] = useState((row?.closePairs ?? []).join(' '));
  const [assetId, setAssetId] = useState<number>(row?.assetId ?? 0);
  const [transcription, setTranscription] = useState(row?.transcription ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plainId = id.trim().toLowerCase();
  const alike = readIds(soundsLike).filter((x) => x !== plainId);
  const pairs = readIds(closePairs).filter((x) => x !== plainId);
  const known = new Set(content.bols.map((b) => b.id));
  const unknown = [...alike, ...pairs].filter((x) => BOL_ID.test(x) && !known.has(x));
  const strokes = content.assets.filter((a) => a.kind === 'stroke' && (a.status !== 'retired' || a.id === row?.assetId));

  const problem = (): string | null => {
    if (!row && (!BOL_ID.test(plainId) || known.has(plainId))) return t(known.has(plainId) ? 'staffPlayground.errors.idTaken' : 'staffPlayground.bol.idProblem');
    if (written.trim().length < 1 || written.trim().length > 12) return t('staffPlayground.bol.writtenProblem');
    if (![...alike, ...pairs].every((x) => BOL_ID.test(x))) return t('staffPlayground.bol.listProblem');
    if (alike.some((x) => pairs.includes(x))) return t('staffPlayground.bol.bothLists');
    return null;
  };

  const save = async () => {
    const p = problem();
    if (p) {
      setError(p);
      return;
    }
    setSaving(true);
    setError(null);
    const errorKey = await saveBol(!row, {
      id: row?.id ?? plainId,
      written: written.trim(),
      head,
      technique,
      open: open === 'unset' ? null : open === 'open',
      levelId,
      soundsLike: alike,
      closePairs: pairs,
      assetId: assetId === 0 ? null : assetId,
      transcription,
    });
    setSaving(false);
    if (errorKey) setError(t(errorKey));
    else router.back();
  };

  return (
    <>
      <Section icon="drum" title={t('staffPlayground.bol.fields')}>
        {row ? (
          <AppText>{t('staffPlayground.bol.idIs', { id: row.id })}</AppText>
        ) : (
          <TextField label={t('staffPlayground.bol.id')} hint={t('staffPlayground.bol.idHint')} value={id} onChangeText={setId} autoCapitalize="none" maxLength={10} required />
        )}
        <TextField label={t('staffPlayground.bol.written')} hint={t('staffPlayground.bol.writtenHint')} value={written} onChangeText={setWritten} maxLength={12} editable={editable} required />
        <ChoiceGroup<Head>
          label={t('staffPlayground.bol.head')}
          value={head}
          onChange={(v) => editable && setHead(v)}
          choices={HEADS.map((value) => ({ value, label: t(`staffPlayground.bol.head_${value}`) }))}
        />
        <ChoiceGroup<number>
          chips
          label={t('staffPlayground.bol.level')}
          value={levelId}
          onChange={(v) => editable && setLevelId(v)}
          choices={LEVEL_IDS.map((l) => ({ value: l, label: levelName(t, l) }))}
        />
        <TextField label={t('staffPlayground.bol.technique')} value={technique} onChangeText={setTechnique} maxLength={200} multiline editable={editable} />
        <ChoiceGroup<Openness>
          chips
          label={t('staffPlayground.bol.open')}
          value={open}
          onChange={(v) => editable && setOpen(v)}
          choices={(['open', 'closed', 'unset'] as const).map((value) => ({ value, label: t(`staffPlayground.bol.open_${value}`) }))}
        />
        <TextField label={t('staffPlayground.bol.soundsLike')} hint={t('staffPlayground.bol.soundsLikeHint')} value={soundsLike} onChangeText={setSoundsLike} autoCapitalize="none" editable={editable} />
        <TextField label={t('staffPlayground.bol.closePairs')} hint={t('staffPlayground.bol.closePairsHint')} value={closePairs} onChangeText={setClosePairs} autoCapitalize="none" editable={editable} />
        {unknown.length > 0 ? <AppText tone="muted">{t('staffPlayground.bol.notYet', { ids: unknown.join(', ') })}</AppText> : null}
        <ChoiceGroup<number>
          chips
          label={t('staffPlayground.bol.recording')}
          value={assetId}
          onChange={(v) => editable && setAssetId(v)}
          choices={[{ value: 0, label: t('staffPlayground.bol.noRecording') }, ...strokes.map((a) => ({ value: a.id, label: `#${a.id}${a.performer ? ` · ${a.performer}` : ''}` }))]}
        />
        <TextField label={t('staffPlayground.bol.transcription')} value={transcription} onChangeText={setTranscription} maxLength={60} editable={editable} />
      </Section>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {editable ? <Button icon="check" label={t('staffPlayground.saveDraft')} loading={saving} onPress={() => void save()} /> : null}
    </>
  );
}
