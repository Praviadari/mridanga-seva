// The photos and PDFs of one announcement, for its readers (C15 and S10, one announcement).
// Photos show on the screen; tapping one opens it full size. A PDF is a row with its name and size
// and an Open button. The files are private: each time the screen loads, Storage gives signed
// links that work for an hour, and only to people who may read the announcement
// (src/data/announcement-files.ts, docs/DECISIONS.md #32).

import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { signedLinks, type Attachment } from '@/data/announcement-files';
import { fileSizeText } from '@/i18n/labels';
import { radius, spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { Button } from './button';

/** Props for AttachmentList. */
export type AttachmentListProps = {
  /** The announcement's files, in order. Nothing is drawn when there are none. */
  attachments: Attachment[];
};

/** The files of an announcement, with signed links loaded when shown. */
export function AttachmentList({ attachments }: AttachmentListProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const paths = attachments.map((a) => a.path).join('\n');
  const [attempt, setAttempt] = useState(0);
  // The links belong to one list of files; a different list means they are still loading.
  const [loaded, setLoaded] = useState<{ paths: string; links: Map<string, string> } | null>(null);
  const links = loaded?.paths === paths ? loaded.links : undefined;

  useEffect(() => {
    let cancelled = false;
    void signedLinks(paths ? paths.split('\n') : []).then((result) => {
      if (!cancelled) setLoaded({ paths, links: result });
    });
    return () => {
      cancelled = true;
    };
  }, [paths, attempt]);

  if (attachments.length === 0) return null;
  const someMissing = links !== undefined && attachments.some((a) => !links.has(a.path));
  const placeholder = links === undefined ? t('common.loading') : t('announcements.files.notAvailable');

  return (
    <View style={styles.list}>
      <AppText variant="label">{t('announcements.files.title', { number: attachments.length })}</AppText>
      {attachments.map((a) => {
        const url = links?.get(a.path);
        // Opened straight from the tap (no waiting first), so a browser does not block the new tab.
        const open = () => {
          if (url) void WebBrowser.openBrowserAsync(url);
        };
        if (a.kind === 'image') {
          return (
            <Pressable
              key={a.path}
              // 'button', not 'imagebutton': the web version reports only 'button' to screen readers.
              accessibilityRole="button"
              accessibilityLabel={t('announcements.files.openPhoto', { name: a.name })}
              disabled={!url}
              onPress={open}
              style={[styles.photoFrame, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {url ? (
                <Image source={{ uri: url }} style={styles.photo} contentFit="contain" transition={150} accessible={false} />
              ) : (
                <AppText tone="muted">{placeholder}</AppText>
              )}
            </Pressable>
          );
        }
        return (
          <View key={a.path} style={[styles.pdfRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.pdfText}>
              <AppText variant="label">{a.name}</AppText>
              <AppText variant="small" tone="muted">
                {url ? t('announcements.files.pdfLine', { size: fileSizeText(t, a.size) }) : placeholder}
              </AppText>
            </View>
            <Button variant="secondary" label={t('announcements.files.open')} disabled={!url} onPress={open} />
          </View>
        );
      })}
      {someMissing ? (
        <Button variant="link" label={t('common.tryAgain')} onPress={() => setAttempt((n) => n + 1)} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
  },
  photoFrame: {
    borderWidth: 1,
    borderRadius: radius,
    height: 240,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  pdfRow: {
    borderWidth: 1,
    borderRadius: radius,
    padding: spacing.md,
    gap: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  pdfText: {
    flex: 1,
    minWidth: 160,
    gap: spacing.xs,
  },
});
