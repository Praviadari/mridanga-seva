// G4 + G5, one level: its syllabus items in teaching order, the lessons and materials for the
// whole level, and the retired items. The Guru moves items up and down here, adds items and
// lessons, and opens an item (levels/item/[id].tsx) to edit, retire or delete it. Coordinators
// see the same page without the buttons that change something. Every rule is checked again by
// the database (migration 0013, docs/DECISIONS.md #44).

import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { ListRow } from '@/components/list-row';
import { LoadingCards } from '@/components/loading-cards';
import { MaterialRow } from '@/components/material-row';
import { Notice } from '@/components/notice';
import { RouteIdGuard } from '@/components/route-id-guard';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { fetchMaterials, type Material } from '@/data/materials';
import { fetchSyllabusByLevel, moveItem, restoreItem, type EditOutcome, type LevelSyllabus } from '@/data/syllabus-editor';
import { levelName } from '@/i18n/labels';
import { spacing } from '@/theme/use-theme';

type Loaded = { level: LevelSyllabus; materials: Material[] };

/** One level's syllabus and lessons. */
function LevelScreenContent() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const levelId = Number(id);
  const { profile } = useAuth();
  const isGuru = profile?.role === 'guru';
  const [loaded, setLoaded] = useState<Loaded | 'not_found' | null | undefined>(undefined);
  // The item being moved or put back, so its buttons show a spinner.
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [levels, materials] = await Promise.all([fetchSyllabusByLevel(), fetchMaterials(levelId)]);
    if (!levels || !materials) {
      setLoaded(null);
      return;
    }
    const level = levels.find((l) => l.levelId === levelId);
    setLoaded(level ? { level, materials } : 'not_found');
  }, [levelId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function change(itemId: number, action: () => Promise<EditOutcome>) {
    setBusy(itemId);
    setError(null);
    const outcome = await action();
    if (outcome.errorKey) setError(t(outcome.errorKey));
    await load();
    setBusy(null);
  }

  const title = Number.isInteger(levelId) && levelId >= 1 && levelId <= 3 ? levelName(t, levelId) : t('syllabusEditor.title');
  const header = <Stack.Screen options={{ title }} />;

  if (loaded === undefined || loaded === null || loaded === 'not_found') {
    return (
      <Screen underHeader centred>
        {header}
        {loaded === undefined ? <LoadingCards /> : null}
        {loaded === 'not_found' ? <EmptyState icon="level" title={t('syllabusEditor.levelNotFound')} /> : null}
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

  const { level, materials } = loaded;
  const levelWide = materials.filter((m) => m.itemId === null);
  const openItem = (itemId: number) =>
    router.push({ pathname: '/staff/levels/item/[id]', params: { id: String(itemId) } });
  const editMaterial = (materialId: number) =>
    router.push({ pathname: '/staff/materials/[id]', params: { id: String(materialId) } });

  return (
    <Screen underHeader onRefresh={load}>
      {header}
      {error ? <Notice tone="error">{error}</Notice> : null}

      <Section
        icon="syllabus"
        title={t('syllabusEditor.itemsTitle')}
        description={isGuru ? t('syllabusEditor.itemsHintGuru') : t('syllabusEditor.itemsHint')}>
        {level.items.length === 0 ? <AppText tone="muted">{t('syllabusEditor.noItems')}</AppText> : null}
        {level.items.map((item, index) => (
          <View key={item.id} style={styles.item}>
            <ListRow
              leading="syllabus"
              title={`${index + 1}. ${item.title}`}
              details={[
                ...(item.description ? [item.description] : []),
                t('syllabusEditor.itemCounts', { ticks: item.ticks, materials: item.materials }),
              ]}
              onPress={() => openItem(item.id)}
            />
            {isGuru ? (
              <View style={styles.moves}>
                <Button
                  variant="link"
                  icon="up"
                  label={t('syllabusEditor.moveUp')}
                  disabled={index === 0 || busy !== null}
                  loading={busy === item.id}
                  onPress={() => void change(item.id, () => moveItem(item.id, true))}
                />
                <Button
                  variant="link"
                  icon="down"
                  label={t('syllabusEditor.moveDown')}
                  disabled={index === level.items.length - 1 || busy !== null}
                  onPress={() => void change(item.id, () => moveItem(item.id, false))}
                />
              </View>
            ) : null}
          </View>
        ))}
        {isGuru ? (
          <Button
            icon="add"
            label={t('syllabusEditor.addItem')}
            onPress={() => router.push({ pathname: '/staff/levels/item/[id]', params: { id: 'new', level: String(levelId) } })}
          />
        ) : null}
      </Section>

      <Section icon="library" title={t('materials.levelTitle')} description={t('materials.levelHint')}>
        {levelWide.length === 0 ? <AppText tone="muted">{t('materials.none')}</AppText> : null}
        {levelWide.map((material) => (
          <MaterialRow
            key={material.id}
            material={material}
            onEdit={isGuru ? () => editMaterial(material.id) : undefined}
          />
        ))}
        {isGuru ? (
          <Button
            variant="secondary"
            icon="add"
            label={t('materials.add')}
            onPress={() => router.push({ pathname: '/staff/materials/[id]', params: { id: 'new', level: String(levelId) } })}
          />
        ) : null}
      </Section>

      {level.retired.length > 0 ? (
        <Section icon="retire" title={t('syllabusEditor.retiredTitle')} description={t('syllabusEditor.retiredHint')}>
          {level.retired.map((item) => (
            <ListRow
              key={item.id}
              leading="retire"
              title={item.title}
              details={[t('syllabusEditor.itemCounts', { ticks: item.ticks, materials: item.materials })]}
              onPress={() => openItem(item.id)}
              action={
                isGuru
                  ? {
                      label: t('syllabusEditor.restore'),
                      variant: 'secondary',
                      loading: busy === item.id,
                      disabled: busy !== null,
                      onPress: () => void change(item.id, () => restoreItem(item.id)),
                    }
                  : undefined
              }
            />
          ))}
        </Section>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  item: {
    gap: spacing.xs,
  },
  moves: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
});

/** Checks the address's id before the screen loads anything (D6-07). */
export default function LevelScreen() {
  return (
    <RouteIdGuard kind="number">
      <LevelScreenContent />
    </RouteIdGuard>
  );
}
