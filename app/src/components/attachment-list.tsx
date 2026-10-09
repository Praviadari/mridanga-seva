// The photos and PDFs of one announcement, for its readers (C15 and S10, one announcement).
// One photo shows large; two or three show as a strip of square thumbnails side by side. Tapping
// a photo opens it full size. A PDF is a row with its name and size and an Open button. The files
// are private: each time the screen loads, Storage gives signed links that work for an hour, and
// only to people who may read the announcement (src/data/announcement-files.ts,
// docs/DECISIONS.md #32). Links older than 50 minutes are fetched again, checked each minute and
// when the app comes back to the screen, so a screen left open never offers an expired link (FS4-03).

import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Pressable, StyleSheet, View } from 'react-native';

import { signedLinks, type Attachment } from '@/data/announcement-files';
import { fileSizeText } from '@/i18n/labels';
import { radius, spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { Button } from './button';
import { Icon } from './icon';
import { Notice } from './notice';

/** Age after which the hour-long links are fetched again, in milliseconds. */
const LINKS_FRESH_MS = 50 * 60_000;

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
  // When the links were fetched (Date.now()), to renew them before they expire.
  const fetchedAt = useRef(0);
  const [openFailed, setOpenFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void signedLinks(paths ? paths.split('\n') : []).then((result) => {
      if (cancelled) return;
      fetchedAt.current = Date.now();
      setLoaded({ paths, links: result });
    });
    return () => {
      cancelled = true;
    };
  }, [paths, attempt]);

  useEffect(() => {
    const renewIfOld = () => {
      if (fetchedAt.current > 0 && Date.now() - fetchedAt.current > LINKS_FRESH_MS) {
        fetchedAt.current = 0;
        setAttempt((n) => n + 1);
      }
    };
    const timer = setInterval(renewIfOld, 60_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') renewIfOld();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, []);

  if (attachments.length === 0) return null;
  const someMissing = links !== undefined && attachments.some((a) => !links.has(a.path));
  const placeholder = links === undefined ? t('common.loading') : t('announcements.files.notAvailable');
  const photos = attachments.filter((a) => a.kind === 'image');
  const pdfs = attachments.filter((a) => a.kind !== 'image');
  // Opened straight from the tap (no waiting first), so a browser does not block the new tab.
  const opener = (url: string | undefined) => () => {
    if (!url) return;
    setOpenFailed(false);
    // D6-16: no browser to open it in, or the phone refused: say so instead of nothing happening.
    WebBrowser.openBrowserAsync(url).catch(() => setOpenFailed(true));
  };

  return (
    <View style={styles.list}>
      <AppText variant="label">{t('announcements.files.title', { number: attachments.length })}</AppText>
      {photos.length > 0 ? (
        <View style={styles.strip}>
          {photos.map((a) => {
            const url = links?.get(a.path);
            return (
              <Pressable
                key={a.path}
                // 'button', not 'imagebutton': the web version reports only 'button' to screen readers.
                accessibilityRole="button"
                accessibilityLabel={t('announcements.files.openPhoto', { name: a.name })}
                disabled={!url}
                onPress={opener(url)}
                style={[
                  styles.photoFrame,
                  // One photo takes the whole width; several share a row as squares.
                  photos.length === 1 ? styles.photoSingle : styles.photoThumb,
                  { backgroundColor: colors.skeleton, borderColor: colors.cardBorder },
                ]}>
                {url ? (
                  <Image
                    // The signed link changes on every load; the path does not (each upload gets
                    // a new random one), so the photo is downloaded once, not on every open (D9-06).
                    source={{ uri: url, cacheKey: a.path }}
                    style={styles.photo}
                    contentFit={photos.length === 1 ? 'contain' : 'cover'}
                    transition={150}
                    accessible={false}
                  />
                ) : (
                  <AppText variant="small" tone="muted" style={styles.centre}>
                    {placeholder}
                  </AppText>
                )}
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {pdfs.map((a) => {
        const url = links?.get(a.path);
        return (
          <View key={a.path} style={[styles.pdfRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Icon name="file" size={24} color={colors.primary} />
            <View style={styles.pdfText}>
              <AppText variant="label">{a.name}</AppText>
              <AppText variant="small" tone="muted">
                {url ? t('announcements.files.pdfLine', { size: fileSizeText(t, a.size) }) : placeholder}
              </AppText>
            </View>
            <Button variant="secondary" label={t('announcements.files.open')} disabled={!url} onPress={opener(url)} />
          </View>
        );
      })}
      {openFailed ? <Notice tone="error">{t('announcements.files.openFailed')}</Notice> : null}
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
  strip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  photoFrame: {
    borderWidth: 1,
    borderRadius: radius,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoSingle: {
    width: '100%',
    height: 240,
  },
  photoThumb: {
    // Three squares fit a 343 px card inside; two share it a little wider.
    flexBasis: '30%',
    flexGrow: 1,
    aspectRatio: 1,
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  centre: {
    textAlign: 'center',
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
