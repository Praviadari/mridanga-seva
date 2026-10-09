// The "Photos and PDFs" part of the announcement form (C15 compose and edit): the files so far,
// each with Remove; "Add photos" and "Add a PDF" while there is room (at most 3); the limits; and a
// reminder that a photo showing a student needs their parent's photo consent (DPDP, many
// students are minors). Nothing is uploaded here: the screen uploads picked files when the
// announcement is saved (src/data/announcements.ts, docs/DECISIONS.md #32).

import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import {
  isPicked,
  MAX_FILES,
  pickPdfs,
  pickPhotos,
  signedLinks,
  type FormFile,
  type PickResult,
} from '@/data/announcement-files';
import { fileSizeText } from '@/i18n/labels';
import { radius, spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { Button } from './button';
import { Notice } from './notice';
import { Section } from './section';

/** Props for AttachmentPicker. */
export type AttachmentPickerProps = {
  files: FormFile[];
  /** Called with the whole new list after a file was added or removed. */
  onChange: (files: FormFile[]) => void;
  /** A problem found by checkAnnouncementForm, already translated. */
  error?: string;
};

/** The files section of the announcement form. */
export function AttachmentPicker({ files, onChange, error }: AttachmentPickerProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [busy, setBusy] = useState<'photos' | 'pdfs' | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const room = MAX_FILES - files.length;

  // Small previews of saved photos (edit form) need signed links; picked ones are on the device.
  const savedPhotos = files.flatMap((f) => (!isPicked(f) && f.kind === 'image' ? [f.path] : [])).join('\n');
  const [previews, setPreviews] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    if (!savedPhotos) return;
    let cancelled = false;
    void signedLinks(savedPhotos.split('\n')).then((links) => {
      if (!cancelled) setPreviews(links);
    });
    return () => {
      cancelled = true;
    };
  }, [savedPhotos]);

  async function add(kind: 'photos' | 'pdfs') {
    setBusy(kind);
    setPickError(null);
    const result: PickResult = kind === 'photos' ? await pickPhotos(room) : await pickPdfs(room);
    setBusy(null);
    if (result.errorKey) setPickError(t(result.errorKey));
    if (result.files.length > 0) onChange([...files, ...result.files]);
  }

  function remove(key: string) {
    setPickError(null);
    onChange(files.filter((f) => f.key !== key));
  }

  return (
    <Section
      title={t('announcements.files.sectionTitle')}
      description={t('announcements.files.limits', { max: MAX_FILES })}>
      <AppText>{t('announcements.files.consentHint')}</AppText>
      {/* A PDF is sent as it is: its name and the details saved inside it reach every reader (D4-16). */}
      {files.some((f) => f.kind === 'pdf') ? <AppText tone="muted">{t('announcements.files.pdfHint')}</AppText> : null}

      {files.map((file) => {
        const preview = file.kind !== 'image' ? undefined : isPicked(file) ? file.uri : previews.get(file.path);
        return (
          <View key={file.key} style={[styles.row, { borderColor: colors.border }]}>
            <View style={[styles.thumb, { backgroundColor: colors.background, borderColor: colors.border }]}>
              {preview ? (
                <Image source={{ uri: preview }} style={styles.thumbImage} contentFit="cover" accessible={false} />
              ) : (
                <AppText variant="small" tone="muted">
                  {file.kind === 'pdf' ? t('announcements.files.pdfBadge') : t('announcements.files.photoBadge')}
                </AppText>
              )}
            </View>
            <View style={styles.rowText}>
              <AppText variant="label">{file.name}</AppText>
              <AppText variant="small" tone="muted">
                {isPicked(file)
                  ? t('announcements.files.pickedLine', { size: fileSizeText(t, file.size) })
                  : fileSizeText(t, file.size)}
              </AppText>
            </View>
            <Button
              variant="link"
              label={t('announcements.files.remove')}
              onPress={() => remove(file.key)}
            />
          </View>
        );
      })}

      {pickError ? <Notice tone="error">{pickError}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}

      {room > 0 ? (
        <View style={styles.actions}>
          <Button
            variant="secondary"
            label={t('announcements.files.addPhotos')}
            loading={busy === 'photos'}
            disabled={busy !== null}
            onPress={() => void add('photos')}
          />
          <Button
            variant="secondary"
            label={t('announcements.files.addPdf')}
            loading={busy === 'pdfs'}
            disabled={busy !== null}
            onPress={() => void add('pdfs')}
          />
        </View>
      ) : (
        <AppText tone="muted">{t('announcements.files.full', { max: MAX_FILES })}</AppText>
      )}
    </Section>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderTopWidth: 1,
    paddingTop: spacing.sm,
    flexWrap: 'wrap',
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: radius,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  rowText: {
    flex: 1,
    minWidth: 140,
    gap: spacing.xs,
  },
  actions: {
    gap: spacing.sm,
  },
});
