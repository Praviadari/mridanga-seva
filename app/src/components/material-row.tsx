// One material of the library (G5) or of My progress (S4): an icon for its kind (YouTube video,
// PDF, photo, note), the title, the optional note, and Open. A YouTube link opens in the YouTube
// app when the phone has it, else in the browser; a PDF or photo opens in the browser through a
// signed link (src/data/materials.ts). No video player inside the app for now. For the Guru an
// Edit button opens the material form.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { openMaterial, type Material } from '@/data/materials';
import { fileSizeText } from '@/i18n/labels';
import { radius, spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { Button } from './button';
import { Icon, type IconName } from './icon';

/** The icon of each kind of material. */
const KIND_ICON: Record<Material['kind'], IconName> = { youtube: 'video', pdf: 'pdf', image: 'photo', note: 'syllabus' };

/** Props for MaterialRow. */
export type MaterialRowProps = {
  material: Material;
  /** Shown for the Guru: opens the material form. */
  onEdit?: () => void;
};

/** A material with its Open button. */
export function MaterialRow({ material, onEdit }: MaterialRowProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [opening, setOpening] = useState(false);
  const [failed, setFailed] = useState(false);

  const kindLine =
    material.kind === 'youtube'
      ? t('materials.kinds.youtube')
      : material.kind === 'note'
        ? t('materials.kinds.note')
        : `${material.kind === 'pdf' ? t('materials.kinds.pdf') : t('materials.kinds.image')}${
            material.fileSize ? ` · ${fileSizeText(t, material.fileSize)}` : ''
          }`;

  async function open() {
    setOpening(true);
    setFailed(false);
    setFailed(!(await openMaterial(material)));
    setOpening(false);
  }

  return (
    <View style={[styles.row, { borderColor: colors.border, backgroundColor: colors.background }]}>
      <View style={styles.main}>
        <Icon name={KIND_ICON[material.kind]} size={24} color={colors.primary} />
        <View style={styles.text}>
          <AppText variant="label">{material.title}</AppText>
          <AppText variant="small" tone="muted">
            {material.approved ? kindLine : `${kindLine} · ${t('materials.suggestion')}`}
          </AppText>
          {material.body ? <AppText variant="small">{material.body}</AppText> : null}
          {failed ? (
            <AppText variant="small" tone="danger">
              {t('materials.openFailed')}
            </AppText>
          ) : null}
        </View>
      </View>
      <View style={styles.actions}>
        {material.kind !== 'note' ? (
          <Button
            variant="secondary"
            icon="open"
            label={material.kind === 'youtube' ? t('materials.watch') : t('materials.open')}
            loading={opening}
            onPress={() => void open()}
          />
        ) : null}
        {onEdit ? <Button variant="link" icon="edit" label={t('materials.edit')} onPress={onEdit} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    borderWidth: 1,
    borderRadius: radius,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  main: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  text: {
    flex: 1,
    gap: 2,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'center',
  },
});
