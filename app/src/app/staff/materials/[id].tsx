// G5, one material, for the Guru: add a lesson or material (`id` = 'new', with `level` and
// optionally `item` to start from) or edit one. A material is a YouTube video link (lesson videos
// are unlisted YouTube videos), a PDF or a photo (at most 10 MB, photos made smaller first, the
// same picker as announcement files), for a level and optionally one syllabus item, with an
// optional note. The file and the kind cannot change after saving: remove the material and add
// it again. Removing asks first. The database checks everything again (migration 0013,
// docs/DECISIONS.md #44); src/data/materials.ts does the work.
// Phase 2 slice 8 (C18, docs/DECISIONS.md #65): a coordinator opens 'new' to suggest a material,
// with a reason, for the Guru (data/suggestions.ts). The Guru opens a waiting suggestion here to
// review it: edit it if needed, then Add to lessons or Decline with a reason.

import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { ChoiceGroup } from '@/components/choice-group';
import { EmptyState } from '@/components/empty-state';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { TextField } from '@/components/text-field';
import {
  addMaterial,
  checkMaterialForm,
  deleteMaterial,
  fetchMaterial,
  MATERIAL_NOTE_MAX,
  MATERIAL_TITLE_MAX,
  MAX_PANES,
  pickMaterialFile,
  updateMaterial,
  type Material,
  type MaterialForm,
  type MaterialFormErrors,
} from '@/data/materials';
import { decideSuggestion, fetchSuggestion, SUGGEST_REASON_MAX, type Suggestion } from '@/data/suggestions';
import { fetchSyllabusByLevel, LEVEL_IDS, type LevelSyllabus } from '@/data/syllabus-editor';
import { fileSizeText, levelName } from '@/i18n/labels';
import { goBackOr } from '@/lib/go-back';
import { spacing } from '@/theme/use-theme';

/** "Whole level" in the item choice (no item). */
const WHOLE_LEVEL = 0;

type Loaded = { levels: LevelSyllabus[]; material: Material | null; suggestion: Suggestion | null };

/** The material form. */
export default function MaterialScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id: string; level?: string; item?: string }>();
  const isNew = params.id === 'new';
  const { profile } = useAuth();
  const myId = profile?.id ?? '';
  const isGuru = profile?.role === 'guru';
  // C18: a coordinator adding a material suggests it.
  const suggesting = isNew && profile?.role === 'coordinator';
  const allowed = isGuru || suggesting;

  const [loaded, setLoaded] = useState<Loaded | 'not_found' | null | undefined>(undefined);
  const [form, setForm] = useState<MaterialForm>({
    title: '',
    kind: 'youtube',
    link: '',
    panes: 1,
    note: '',
    levelId: Number(params.level) || 1,
    itemId: Number(params.item) || null,
    file: null,
  });
  const [errors, setErrors] = useState<MaterialFormErrors>({});
  const [busy, setBusy] = useState<'save' | 'pick' | 'delete' | null>(null);
  const [asking, setAsking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [declining, setDeclining] = useState(false);
  const [declineReason, setDeclineReason] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [levels, material] = await Promise.all([
        fetchSyllabusByLevel(),
        isNew ? Promise.resolve(null) : fetchMaterial(Number(params.id)),
      ]);
      if (cancelled) return;
      if (!levels || (!isNew && material === null)) {
        setLoaded(null);
        return;
      }
      if (material === 'not_found') {
        setLoaded('not_found');
        return;
      }
      // A waiting suggestion: who suggested it and why, for the Guru's review.
      const suggestion = material && !material.approved ? await fetchSuggestion(material.id) : null;
      if (cancelled) return;
      setLoaded({ levels, material, suggestion: suggestion && suggestion !== 'not_found' && suggestion.state === 'waiting' ? suggestion : null });
      if (material) {
        setForm({
          title: material.title,
          kind: material.kind,
          link: material.url ?? '',
          panes: material.panes,
          note: material.body ?? '',
          levelId: material.levelId,
          itemId: material.itemId,
          file: null,
        });
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [isNew, params.id]);

  const header = <Stack.Screen
      options={{ title: suggesting ? t('suggestions.suggest') : isNew ? t('materials.add') : t('materials.editTitle') }}
    />;

  if (!allowed || loaded === undefined || loaded === null || loaded === 'not_found') {
    return (
      <Screen underHeader centred>
        {header}
        {!allowed ? <Notice tone="info">{t('materials.guruOnly')}</Notice> : null}
        {allowed && loaded === undefined ? <LoadingCards /> : null}
        {allowed && loaded === 'not_found' ? <EmptyState icon="library" title={t('materials.notFound')} /> : null}
        {allowed && loaded === null ? (
          <Notice tone="error" title={t('materials.loadFailed')}>
            {t('common.networkError')}
          </Notice>
        ) : null}
      </Screen>
    );
  }

  const { levels, material, suggestion } = loaded;
  const level = levels.find((l) => l.levelId === form.levelId);
  // Items in use of the chosen level; a retired item stays choosable when it is already the one.
  const itemChoices = [
    { value: WHOLE_LEVEL, label: t('materials.wholeLevel') },
    ...(level?.items ?? []).map((item, index) => ({ value: item.id, label: `${index + 1}. ${item.title}` })),
    ...(level?.retired ?? [])
      .filter((item) => item.id === form.itemId)
      .map((item) => ({ value: item.id, label: `${item.title} (${t('syllabusEditor.retiredChip')})` })),
  ];
  const update = (patch: Partial<MaterialForm>) => setForm((current) => ({ ...current, ...patch }));
  const editingFile = material && material.kind !== 'youtube' && material.kind !== 'video' && material.kind !== 'note';

  async function pick() {
    if (form.kind !== 'pdf' && form.kind !== 'image') return;
    setBusy('pick');
    setMessage(null);
    const result = await pickMaterialFile(form.kind);
    setBusy(null);
    if (result.errorKey) setMessage(t(result.errorKey));
    const file = result.files[0];
    if (file) update({ file, title: form.title || file.name.replace(/\.[^.]*$/, '') });
  }

  async function save() {
    const found = checkMaterialForm(form, isNew);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setBusy('save');
    setMessage(null);
    const outcome = isNew ? await addMaterial(myId, form) : await updateMaterial(Number(params.id), form);
    setBusy(null);
    if (outcome.errorKey) setMessage(t(outcome.errorKey));
    // A coordinator's suggestion is listed on C18, not on the level page.
    else goBackOr(suggesting ? '/staff/suggestions' : { pathname: '/staff/levels/[id]', params: { id: String(form.levelId) } });
  }

  /** The Guru's review: saves the edits, then adds the suggestion to the lessons or declines it. */
  async function decide(approve: boolean) {
    if (!material) return;
    if (approve) {
      const found = checkMaterialForm(form, false);
      setErrors(found);
      if (Object.keys(found).length > 0) return;
    }
    setBusy('save');
    setMessage(null);
    const saved = approve ? await updateMaterial(material.id, form) : {};
    const outcome = saved.errorKey ? saved : await decideSuggestion(material.id, approve, declineReason);
    setBusy(null);
    if (outcome.errorKey) setMessage(t(outcome.errorKey));
    else goBackOr('/staff/suggestions');
  }

  async function remove() {
    if (!material) return;
    setBusy('delete');
    setMessage(null);
    const outcome = await deleteMaterial(material);
    setBusy(null);
    if (outcome.errorKey) setMessage(t(outcome.errorKey));
    else goBackOr({ pathname: '/staff/levels/[id]', params: { id: String(form.levelId) } });
  }

  return (
    <Screen underHeader>
      {header}
      {message ? <Notice tone="error">{message}</Notice> : null}
      {suggesting ? <Notice tone="info">{t('suggestions.formIntro')}</Notice> : null}
      {suggestion ? (
        <Notice tone="info" title={t('suggestions.reviewTitle', { name: suggestion.suggestedBy })}>
          {suggestion.reason ? t('suggestions.reasonLine', { reason: suggestion.reason }) : t('suggestions.noReason')}
        </Notice>
      ) : null}

      <Section icon="library" title={isNew ? t('materials.whatTitle') : t('materials.editTitle')}>
        {isNew ? (
          <ChoiceGroup<MaterialForm['kind']>
            label={t('materials.kindLabel')}
            choices={[
              { value: 'youtube', label: t('materials.kinds.youtube') },
              { value: 'video', label: t('materials.kinds.video') },
              { value: 'pdf', label: t('materials.kinds.pdf') },
              { value: 'image', label: t('materials.kinds.image') },
            ]}
            value={form.kind}
            onChange={(kind) => update({ kind, file: null })}
          />
        ) : null}

        {form.kind === 'youtube' ? (
          <TextField
            label={t('materials.linkLabel')}
            hint={t('materials.linkHint')}
            value={form.link}
            onChangeText={(link) => update({ link })}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            error={errors.link ? t(errors.link) : undefined}
          />
        ) : null}

        {form.kind === 'video' ? (
          <>
            <TextField
              label={t('materials.videoLinkLabel')}
              hint={t('materials.videoLinkHint')}
              value={form.link}
              onChangeText={(link) => update({ link })}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              error={errors.link ? t(errors.link) : undefined}
            />
            <ChoiceGroup<number>
              chips
              label={t('materials.panesLabel')}
              choices={Array.from({ length: MAX_PANES }, (_, i) => ({ value: i + 1, label: String(i + 1) }))}
              value={form.panes}
              onChange={(panes) => update({ panes })}
            />
            <AppText variant="small" tone="muted">
              {t('materials.panesHint')}
            </AppText>
          </>
        ) : null}

        {isNew && (form.kind === 'pdf' || form.kind === 'image') ? (
          <View style={styles.file}>
            {form.file ? (
              <AppText>{t('materials.picked', { name: form.file.name, size: fileSizeText(t, form.file.size) })}</AppText>
            ) : (
              <AppText tone="muted">{form.kind === 'pdf' ? t('materials.pickPdfHint') : t('materials.pickPhotoHint')}</AppText>
            )}
            <Button
              variant="secondary"
              icon={form.kind === 'pdf' ? 'pdf' : 'photo'}
              label={form.file ? t('materials.pickOther') : form.kind === 'pdf' ? t('materials.pickPdf') : t('materials.pickPhoto')}
              loading={busy === 'pick'}
              disabled={busy !== null}
              onPress={() => void pick()}
            />
            {errors.file ? <AppText tone="danger">{t(errors.file)}</AppText> : null}
            {form.kind === 'image' ? <AppText variant="small" tone="muted">{t('announcements.files.consentHint')}</AppText> : null}
          </View>
        ) : null}
        {editingFile ? (
          <AppText tone="muted">
            {t('materials.fileKept', { name: material.fileName ?? '', size: fileSizeText(t, material.fileSize ?? 0) })}
          </AppText>
        ) : null}

        <TextField
          label={t('materials.titleLabel')}
          hint={t('materials.titleHint', { max: MATERIAL_TITLE_MAX })}
          value={form.title}
          onChangeText={(title) => update({ title })}
          maxLength={MATERIAL_TITLE_MAX + 20}
          error={errors.title ? t(errors.title) : undefined}
        />
        <TextField
          label={t('materials.noteLabel')}
          hint={t('materials.noteHint')}
          value={form.note}
          onChangeText={(note) => update({ note })}
          multiline
          maxLength={MATERIAL_NOTE_MAX + 50}
          error={errors.note ? t(errors.note) : undefined}
        />
        {suggesting ? (
          <TextField
            label={t('suggestions.reasonLabel')}
            hint={t('suggestions.reasonHint', { max: SUGGEST_REASON_MAX })}
            value={form.reason ?? ''}
            onChangeText={(reason) => update({ reason })}
            multiline
            maxLength={SUGGEST_REASON_MAX}
          />
        ) : null}
      </Section>

      <Section icon="level" title={t('materials.whereTitle')} description={t('materials.whereHint')}>
        <ChoiceGroup<number>
          label={t('materials.levelLabel')}
          choices={LEVEL_IDS.map((id) => ({ value: id, label: levelName(t, id) }))}
          value={form.levelId}
          onChange={(levelId) => update({ levelId, itemId: null })}
        />
        <ChoiceGroup<number>
          label={t('materials.itemLabel')}
          chips
          choices={itemChoices}
          value={form.itemId ?? WHOLE_LEVEL}
          onChange={(itemId) => update({ itemId: itemId === WHOLE_LEVEL ? null : itemId })}
        />
      </Section>

      {busy === 'save' && isNew && form.file ? <AppText tone="muted">{t('announcements.files.uploading')}</AppText> : null}
      {suggestion ? (
        // C18 review: add it (with any edits above) or decline it with a reason.
        declining ? (
          <Section icon="alert" title={t('suggestions.declineTitle')}>
            <TextField
              label={t('suggestions.declineLabel')}
              hint={t('suggestions.declineHint')}
              value={declineReason}
              onChangeText={setDeclineReason}
              multiline
              maxLength={SUGGEST_REASON_MAX}
            />
            <View style={styles.row}>
              <Button
                icon="send"
                label={t('suggestions.declineYes')}
                loading={busy === 'save'}
                disabled={busy !== null || !declineReason.trim()}
                onPress={() => void decide(false)}
              />
              <Button variant="link" label={t('syllabusEditor.cancel')} onPress={() => setDeclining(false)} />
            </View>
          </Section>
        ) : (
          <View style={styles.row}>
            <Button icon="check" label={t('suggestions.approve')} loading={busy === 'save'} disabled={busy !== null} onPress={() => void decide(true)} />
            <Button variant="secondary" icon="alert" label={t('suggestions.decline')} disabled={busy !== null} onPress={() => setDeclining(true)} />
          </View>
        )
      ) : (
        <Button
          icon={suggesting ? 'send' : 'check'}
          label={suggesting ? t('suggestions.send') : isNew ? t('materials.addSave') : t('materials.save')}
          loading={busy === 'save'}
          disabled={busy !== null}
          onPress={() => void save()}
        />
      )}

      {material ? (
        asking ? (
          <>
            <Notice tone="error" title={t('materials.deleteAsk')}>
              {t('materials.deleteAskBody')}
            </Notice>
            <View style={styles.row}>
              <Button
                icon="delete"
                label={t('materials.deleteYes')}
                loading={busy === 'delete'}
                disabled={busy !== null}
                onPress={() => void remove()}
              />
              <Button variant="link" label={t('syllabusEditor.cancel')} onPress={() => setAsking(false)} />
            </View>
          </>
        ) : (
          <Button variant="link" icon="delete" label={t('materials.delete')} onPress={() => setAsking(true)} />
        )
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  file: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'center',
  },
});
