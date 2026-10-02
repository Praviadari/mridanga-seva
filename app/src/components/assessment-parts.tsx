// Building blocks of the assessment screens (Phase 2: G6, C12, C13, C14, S7): the coloured status
// label of a student's assessment, the words for its type and status, the files of an assessment
// or a recording with Open / Play, and the scores of a review line by line.
//
// Files open through signed links that work for an hour (src/data/assessment-files.ts). Audio and
// video play in the phone's browser view (expo-web-browser, already in the app): the app has no
// media player of its own, and adding one is a native change (a new APK).

import type { TFunction } from 'i18next';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { mediaLinks, type MediaFile, type MediaKind } from '@/data/assessment-files';
import { isOverdue, type AssessmentKind, type AssignmentStatus, type RubricLine } from '@/data/assessments';
import { fileSizeText } from '@/i18n/labels';
import type { ChipTone } from '@/theme/colors';
import { radius, spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { Button } from './button';
import { Icon, type IconName } from './icon';
import { Chip } from './status-chip';

/** Colour of each status: Not seen grey, Seen blue, Submitted amber (to review), Reviewed green, Redo red. */
const STATUS_TONE: Record<AssignmentStatus, ChipTone> = {
  assigned: 'neutral',
  seen: 'info',
  submitted: 'warning',
  reviewed: 'success',
  redo: 'danger',
};

/** The word for a status: Not seen, Seen, Submitted, Reviewed, Redo. */
export function assignmentStatusName(t: TFunction, status: AssignmentStatus): string {
  return t(`assessments.status.${status}`);
}

/** The word for a type: Playing, Singing, Theory, Other. */
export function assessmentKindName(t: TFunction, kind: AssessmentKind): string {
  return t(`assessments.kinds.${kind}`);
}

/** The status as a coloured label, and "Late" when the due date has passed without a recording. */
export function AssignmentChips({ status, dueOn }: { status: AssignmentStatus; dueOn?: string }) {
  const { t } = useTranslation();
  return (
    <View style={styles.chips}>
      <Chip label={assignmentStatusName(t, status)} tone={STATUS_TONE[status]} />
      {dueOn && isOverdue({ status, dueOn }) ? <Chip label={t('assessments.late')} tone="danger" /> : null}
    </View>
  );
}

const KIND_ICON: Record<MediaKind, IconName> = { image: 'file', pdf: 'file', audio: 'audio', video: 'video' };

/** Props for MediaList. */
export type MediaListProps = {
  files: MediaFile[];
  /** A link given with the files (an unlisted YouTube video ...), shown as one more row. */
  link?: string | null;
  /** Shown instead of a file that was deleted after its keep time. */
  removedNote?: string;
};

/** The files of an assessment or a recording: one row each, with Open (photo, PDF) or Play (audio, video). */
export function MediaList({ files, link, removedNote }: MediaListProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const paths = files.map((f) => f.path).join('\n');
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{ paths: string; links: Map<string, string> } | null>(null);
  const links = loaded?.paths === paths ? loaded.links : undefined;

  useEffect(() => {
    let cancelled = false;
    void mediaLinks(paths ? paths.split('\n') : []).then((result) => {
      if (!cancelled) setLoaded({ paths, links: result });
    });
    return () => {
      cancelled = true;
    };
  }, [paths, attempt]);

  if (files.length === 0 && !link && !removedNote) return null;
  const someMissing = links !== undefined && files.some((f) => !links.has(f.path));
  // Opened straight from the tap, so a browser does not block the new tab.
  const open = (url: string | undefined) => () => {
    if (url) void WebBrowser.openBrowserAsync(url);
  };

  return (
    <View style={styles.list}>
      {files.map((file) => {
        const url = links?.get(file.path);
        const playable = file.kind === 'audio' || file.kind === 'video';
        return (
          <View key={file.path} style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Icon name={KIND_ICON[file.kind]} size={24} color={colors.primary} />
            <View style={styles.rowText}>
              <AppText variant="label">{file.name}</AppText>
              <AppText variant="small" tone="muted">
                {url || links === undefined ? `${t(`assessments.files.kind.${file.kind}`)} · ${fileSizeText(t, file.size)}` : t('announcements.files.notAvailable')}
              </AppText>
            </View>
            <Button
              variant="secondary"
              icon={playable ? 'play' : undefined}
              label={playable ? t('assessments.files.play') : t('announcements.files.open')}
              disabled={!url}
              onPress={open(url)}
            />
          </View>
        );
      })}
      {removedNote ? (
        <AppText variant="small" tone="muted">
          {removedNote}
        </AppText>
      ) : null}
      {link ? (
        <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Icon name="link" size={24} color={colors.primary} />
          <View style={styles.rowText}>
            <AppText variant="label">{t('assessments.files.link')}</AppText>
            <AppText variant="small" tone="muted" numberOfLines={1}>
              {link}
            </AppText>
          </View>
          <Button variant="secondary" icon="play" label={t('assessments.files.openLink')} onPress={open(link)} />
        </View>
      ) : null}
      {someMissing ? <Button variant="link" label={t('common.tryAgain')} onPress={() => setAttempt((n) => n + 1)} /> : null}
    </View>
  );
}

/** The scores of a review, one line per rubric line, and the total. */
export function ScoreLines({ rubric, scores, total, max }: { rubric: RubricLine[]; scores: number[]; total: number | null; max: number | null }) {
  const { t } = useTranslation();
  return (
    <View style={styles.list}>
      {rubric.map((line, i) => (
        <View key={`${line.criterion}-${i}`} style={styles.scoreRow}>
          <AppText style={styles.rowText}>{line.criterion}</AppText>
          <AppText variant="label">{t('assessments.scoreOf', { score: scores[i] ?? '—', max: line.max })}</AppText>
        </View>
      ))}
      {total !== null && max !== null ? (
        <View style={styles.scoreRow}>
          <AppText variant="label" style={styles.rowText}>
            {t('assessments.total')}
          </AppText>
          <AppText variant="label">{t('assessments.scoreOf', { score: total, max })}</AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  list: {
    gap: spacing.sm,
  },
  row: {
    borderWidth: 1,
    borderRadius: radius,
    padding: spacing.md,
    gap: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  rowText: {
    flex: 1,
    minWidth: 140,
    gap: spacing.xs,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
});
