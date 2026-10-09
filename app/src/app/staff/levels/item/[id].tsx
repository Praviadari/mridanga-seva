// G4, one syllabus item: its title and description, how many students have it ticked, and its
// lessons and materials (G5). The Guru edits the text, adds lessons, and retires, puts back or
// deletes the item; `id` = 'new' (with `level`) adds an item at the end of that level.
// Ticks always survive (docs/DECISIONS.md #44): editing keeps them; an item with ticks or
// materials can only be retired, never deleted; delete is offered only for an item nobody has
// ticked and no material points to. Retire and delete ask first. Coordinators see the item
// read-only.

import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { LoadingCards } from '@/components/loading-cards';
import { MaterialRow } from '@/components/material-row';
import { Notice } from '@/components/notice';
import { RouteIdGuard } from '@/components/route-id-guard';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { Chip } from '@/components/status-chip';
import { TextField } from '@/components/text-field';
import { fetchMaterials, type Material } from '@/data/materials';
import {
  addItem,
  checkItemForm,
  deleteItem,
  fetchSyllabusByLevel,
  ITEM_DESCRIPTION_MAX,
  ITEM_TITLE_MAX,
  restoreItem,
  retireItem,
  saveItem,
  type EditorItem,
  type EditOutcome,
  type ItemFormErrors,
} from '@/data/syllabus-editor';
import { levelName } from '@/i18n/labels';
import { spacing } from '@/theme/use-theme';

type Loaded = { item: EditorItem | null; levelId: number; position: number; materials: Material[] };

/** Add or edit one syllabus item. */
function SyllabusItemScreenContent() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id: string; level?: string }>();
  const isNew = params.id === 'new';
  const itemId = Number(params.id);
  const { profile } = useAuth();
  const isGuru = profile?.role === 'guru';

  const [loaded, setLoaded] = useState<Loaded | 'not_found' | null | undefined>(undefined);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<ItemFormErrors>({});
  const [busy, setBusy] = useState<'save' | 'retire' | 'restore' | 'delete' | null>(null);
  const [asking, setAsking] = useState<'retire' | 'delete' | null>(null);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  const load = useCallback(async () => {
    const levels = await fetchSyllabusByLevel();
    if (!levels) {
      setLoaded(null);
      return;
    }
    if (isNew) {
      const levelId = Number(params.level);
      const level = levels.find((l) => l.levelId === levelId);
      setLoaded(level ? { item: null, levelId, position: level.items.length + 1, materials: [] } : 'not_found');
      return;
    }
    for (const level of levels) {
      const index = level.items.findIndex((i) => i.id === itemId);
      const item = index >= 0 ? level.items[index] : level.retired.find((i) => i.id === itemId);
      if (!item) continue;
      const materials = await fetchMaterials(level.levelId);
      if (!materials) {
        setLoaded(null);
        return;
      }
      setLoaded({ item, levelId: level.levelId, position: index + 1, materials: materials.filter((m) => m.itemId === item.id) });
      return;
    }
    setLoaded('not_found');
  }, [isNew, itemId, params.level]);

  // The form is filled once, when the item first loads; later reloads (after adding a lesson)
  // keep what the Guru is typing.
  const [filled, setFilled] = useState(false);
  if (!filled && loaded && loaded !== 'not_found' && loaded.item) {
    setFilled(true);
    setTitle(loaded.item.title);
    setDescription(loaded.item.description ?? '');
  }

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const header = <Stack.Screen options={{ title: isNew ? t('syllabusEditor.addItem') : t('syllabusEditor.itemTitle') }} />;

  if (loaded === undefined || loaded === null || loaded === 'not_found') {
    return (
      <Screen underHeader centred>
        {header}
        {loaded === undefined ? <LoadingCards /> : null}
        {loaded === 'not_found' ? <EmptyState icon="syllabus" title={t('syllabusEditor.itemNotFound')} /> : null}
        {loaded === null ? (
          <>
            <Notice tone="error" title={t('syllabusEditor.loadFailed')}>
              {t('common.networkError')}
            </Notice>
            <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
          </>
        ) : null}
      </Screen>
    );
  }

  const { item, levelId, position, materials } = loaded;
  const retired = item?.retiredAt != null;
  const canDelete = item !== null && item.ticks === 0 && item.materials === 0;

  async function run(kind: 'save' | 'retire' | 'restore' | 'delete', action: () => Promise<EditOutcome>, done: string) {
    setBusy(kind);
    setMessage(null);
    const outcome = await action();
    setBusy(null);
    setAsking(null);
    if (outcome.errorKey) {
      setMessage({ tone: 'error', text: t(outcome.errorKey) });
      return outcome;
    }
    setMessage({ tone: 'success', text: done });
    return outcome;
  }

  async function save() {
    const found = checkItemForm(title, description);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    if (isNew) {
      const outcome = await run('save', () => addItem(levelId, title, description), t('syllabusEditor.added'));
      // Opens the new item, where the Guru can add its lessons straight away.
      if (outcome.id) router.replace({ pathname: '/staff/levels/item/[id]', params: { id: String(outcome.id) } });
      return;
    }
    if (item) {
      await run('save', () => saveItem(item.id, title, description), t('syllabusEditor.saved'));
      await load();
    }
  }

  async function removeItem() {
    if (!item) return;
    const outcome = await run('delete', () => deleteItem(item.id), t('syllabusEditor.deleted'));
    // To the level's page, also when the item was opened straight from an address.
    if (!outcome.errorKey) router.replace({ pathname: '/staff/levels/[id]', params: { id: String(levelId) } });
  }

  return (
    <Screen underHeader onRefresh={load}>
      {header}
      <AppText tone="muted">
        {isNew
          ? t('syllabusEditor.newItemLine', { level: levelName(t, levelId), position })
          : retired
            ? t('syllabusEditor.retiredLine', { level: levelName(t, levelId) })
            : t('syllabusEditor.itemLine', { level: levelName(t, levelId), position })}
      </AppText>
      {retired ? (
        <View style={styles.chip}>
          <Chip label={t('syllabusEditor.retiredChip')} tone="neutral" />
        </View>
      ) : null}
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      {isGuru ? (
        <Section icon="edit" title={t('syllabusEditor.textTitle')}>
          <TextField
            label={t('syllabusEditor.titleLabel')}
            hint={t('syllabusEditor.titleHint', { max: ITEM_TITLE_MAX })}
            value={title}
            onChangeText={setTitle}
            maxLength={ITEM_TITLE_MAX + 20}
            error={errors.title ? t(errors.title) : undefined}
          />
          <TextField
            label={t('syllabusEditor.descriptionLabel')}
            hint={t('syllabusEditor.descriptionHint', { max: ITEM_DESCRIPTION_MAX })}
            value={description}
            onChangeText={setDescription}
            multiline
            maxLength={ITEM_DESCRIPTION_MAX + 50}
            error={errors.description ? t(errors.description) : undefined}
          />
          {item && item.ticks > 0 ? <AppText variant="small" tone="muted">{t('syllabusEditor.ticksKept', { count: item.ticks })}</AppText> : null}
          <Button
            icon="check"
            label={isNew ? t('syllabusEditor.addItem') : t('syllabusEditor.save')}
            loading={busy === 'save'}
            disabled={busy !== null}
            onPress={() => void save()}
          />
        </Section>
      ) : item ? (
        <Section icon="syllabus" title={item.title}>
          {item.description ? <AppText>{item.description}</AppText> : null}
          <AppText tone="muted">{t('syllabusEditor.itemCounts', { ticks: item.ticks, materials: item.materials })}</AppText>
        </Section>
      ) : null}

      {item ? (
        <Section icon="library" title={t('materials.itemTitle')} description={t('materials.itemHint')}>
          {materials.length === 0 ? <AppText tone="muted">{t('materials.none')}</AppText> : null}
          {materials.map((material) => (
            <MaterialRow
              key={material.id}
              material={material}
              onEdit={
                isGuru
                  ? () => router.push({ pathname: '/staff/materials/[id]', params: { id: String(material.id) } })
                  : undefined
              }
            />
          ))}
          {isGuru ? (
            <Button
              variant="secondary"
              icon="add"
              label={t('materials.add')}
              onPress={() =>
                router.push({
                  pathname: '/staff/materials/[id]',
                  params: { id: 'new', level: String(levelId), item: String(item.id) },
                })
              }
            />
          ) : null}
        </Section>
      ) : null}

      {isGuru && item ? (
        <Section icon="retire" title={t('syllabusEditor.retireTitle')} description={t('syllabusEditor.retireHint')}>
          {retired ? (
            <Button
              variant="secondary"
              icon="restore"
              label={t('syllabusEditor.restore')}
              loading={busy === 'restore'}
              disabled={busy !== null}
              onPress={() =>
                void run('restore', () => restoreItem(item.id), t('syllabusEditor.restored')).then(() => load())
              }
            />
          ) : asking === 'retire' ? (
            <Notice tone="info" title={t('syllabusEditor.retireAsk')}>
              {t('syllabusEditor.retireAskBody', { count: item.ticks })}
            </Notice>
          ) : null}
          {!retired && asking === 'retire' ? (
            <View style={styles.row}>
              <Button
                icon="retire"
                label={t('syllabusEditor.retireYes')}
                loading={busy === 'retire'}
                disabled={busy !== null}
                onPress={() =>
                  void run('retire', () => retireItem(item.id), t('syllabusEditor.retiredDone')).then(() => load())
                }
              />
              <Button variant="link" label={t('syllabusEditor.cancel')} onPress={() => setAsking(null)} />
            </View>
          ) : null}
          {!retired && asking === null ? (
            <Button variant="secondary" icon="retire" label={t('syllabusEditor.retire')} onPress={() => setAsking('retire')} />
          ) : null}

          {canDelete && asking === 'delete' ? (
            <>
              <Notice tone="error" title={t('syllabusEditor.deleteAsk')}>
                {t('syllabusEditor.deleteAskBody')}
              </Notice>
              <View style={styles.row}>
                <Button
                  icon="delete"
                  label={t('syllabusEditor.deleteYes')}
                  loading={busy === 'delete'}
                  disabled={busy !== null}
                  onPress={() => void removeItem()}
                />
                <Button variant="link" label={t('syllabusEditor.cancel')} onPress={() => setAsking(null)} />
              </View>
            </>
          ) : null}
          {canDelete && asking === null ? (
            <Button variant="link" icon="delete" label={t('syllabusEditor.delete')} onPress={() => setAsking('delete')} />
          ) : null}
          {!canDelete && !retired ? (
            <AppText variant="small" tone="muted">
              {t('syllabusEditor.cannotDelete')}
            </AppText>
          ) : null}
        </Section>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'center',
  },
});

/** Checks the address's id before the screen loads anything (D6-07). */
export default function SyllabusItemScreen() {
  return (
    <RouteIdGuard kind="number" allowNew>
      <SyllabusItemScreenContent />
    </RouteIdGuard>
  );
}
