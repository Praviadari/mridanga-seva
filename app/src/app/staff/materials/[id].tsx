// G5, one material, for the Guru: add a lesson or material (`id` = 'new', with `level` and
// optionally `item` to start from) or edit one. A material is a YouTube video link (lesson videos
// are unlisted YouTube videos), a PDF or a photo (at most 10 MB, photos made smaller first, the
// same picker as announcement files), for a level and optionally one syllabus item, with an
// optional note. The file and the kind cannot change after saving: remove the material and add
// it again. Removing asks first. The database checks everything again (migration 0013,
// docs/DECISIONS.md #44); src/data/materials.ts does the work.

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
import { fetchSyllabusByLevel, LEVEL_IDS, type LevelSyllabus } from '@/data/syllabus-editor';
import { fileSizeText, levelName } from '@/i18n/labels';
import { goBackOr } from '@/lib/go-back';
import { spacing } from '@/theme/use-theme';

/** "Whole level" in the item choice (no item). */
const WHOLE_LEVEL = 0;

type Loaded = { levels: LevelSyllabus[]; material: Material | null };

/** The material form. */
export default function MaterialScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id: string; level?: string; item?: string }>();
  const isNew = params.id === 'new';
  const { profile } = useAuth();
  const myId = profile?.id ?? '';
  const isGuru = profile?.role === 'guru';

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
      setLoaded({ levels, material });
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

  const header = <Stack.Screen options={{ title: isNew ? t('materials.add') : t('materials.editTitle') }} />;

  if (!isGuru || loaded === undefined || loaded === null || loaded === 'not_found') {
    return (
      <Screen underHeader centred>
        {header}
        {!isGuru ? <Notice tone="info">{t('materials.guruOnly')}</Notice> : null}
        {isGuru && loaded === undefined ? <LoadingCards /> : null}
        {isGuru && loaded === 'not_found' ? <EmptyState icon="library" title={t('materials.notFound')} /> : null}
        {isGuru && loaded === null ? (
          <Notice tone="error" title={t('materials.loadFailed')}>
            {t('common.networkError')}
          </Notice>
        ) : null}
      </Screen>
    );
  }

  const { levels, material } = loaded;
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
    else goBackOr({ pathname: '/staff/levels/[id]', params: { id: String(form.levelId) } });
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
      <Button
        icon="check"
        label={isNew ? t('materials.addSave') : t('materials.save')}
        loading={busy === 'save'}
        disabled={busy !== null}
        onPress={() => void save()}
      />

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
