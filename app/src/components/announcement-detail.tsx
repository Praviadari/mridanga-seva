// The announcement itself on its own screen (C15 for staff, S10 for students): one card with a
// "Pinned" strip across the top when it is pinned, the title, the whole message, its photos and
// PDFs, and the facts under it, each with a small icon: when, who posted it, who it is for, when
// it was edited. The screen around it adds its own things (seen list, replies, actions).

import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { Attachment } from '@/data/announcement-files';
import { cardLook, cardRadius, spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { AttachmentList } from './attachment-list';
import { Icon, type IconName } from './icon';

/** One fact under the message, e.g. the time icon and "01-10-2026 18:05". */
export type AnnouncementFact = { icon: IconName; text: string };

/** Props for AnnouncementDetail. */
export type AnnouncementDetailProps = {
  title: string;
  body: string;
  pinned: boolean;
  attachments: Attachment[];
  /** The facts under the message, already worded, in order. */
  facts: AnnouncementFact[];
};

/** The announcement card. */
export function AnnouncementDetail({ title, body, pinned, attachments, facts }: AnnouncementDetailProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={[styles.card, cardLook(colors), pinned && { borderColor: colors.primary }]}>
      {pinned ? (
        <View style={[styles.pinStrip, { backgroundColor: colors.primarySoft }]}>
          <Icon name="pin" size={16} color={colors.onPrimarySoft} />
          <AppText variant="small" style={{ color: colors.onPrimarySoft, fontWeight: '600' }}>
            {t('announcements.pinned')}
          </AppText>
        </View>
      ) : null}
      <View style={styles.inside}>
        <AppText variant="title">{title}</AppText>
        <AppText selectable>{body}</AppText>
        <AttachmentList attachments={attachments} />
        <View style={[styles.facts, { borderTopColor: colors.cardBorder }]}>
          {facts.map((fact) => (
            <View key={`${fact.icon}-${fact.text}`} style={styles.fact}>
              <Icon name={fact.icon} size={16} color={colors.textMuted} />
              <AppText variant="small" tone="muted" style={styles.factText}>
                {fact.text}
              </AppText>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    // The strip reaches the card's rounded corners.
    overflow: 'hidden',
  },
  pinStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderTopLeftRadius: cardRadius - 1,
    borderTopRightRadius: cardRadius - 1,
  },
  inside: {
    padding: spacing.md,
    gap: spacing.md,
  },
  facts: {
    borderTopWidth: 1,
    paddingTop: spacing.sm,
    gap: spacing.xs,
  },
  fact: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  factText: {
    flex: 1,
  },
});
