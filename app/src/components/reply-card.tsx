// One private reply to an announcement: who wrote it (with their initials), the text, and when.
// Shown to the author and the Guru on C15 (every reply), and to a student on S10 (only their own).
// Optionally one small action under it, such as the Guru's "Delete".

import { StyleSheet, View } from 'react-native';

import { cardLook, spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { Button, type ButtonProps } from './button';
import { Initials } from './list-row';

/** Props for ReplyCard. */
export type ReplyCardProps = {
  /** Who wrote it, already worded, e.g. "Arjun Rao · MS-2026-0003". Left out for one's own replies. */
  writer?: string;
  /** The reply, shown as written. */
  body: string;
  /** When it was sent, already worded, e.g. "Sent 30-09-2026 18:05". */
  when: string;
  /** Actions under the reply, e.g. Delete, or Yes and Cancel while confirming. */
  actions?: Pick<ButtonProps, 'label' | 'onPress' | 'loading' | 'variant'>[];
};

/** A card for one reply: initials and name on the first line, then the text, then the time and actions. */
export function ReplyCard({ writer, body, when, actions = [] }: ReplyCardProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, cardLook(colors)]}>
      {writer ? (
        <View style={styles.writer}>
          <Initials name={writer} size={32} />
          <AppText variant="label" style={styles.writerName}>
            {writer}
          </AppText>
        </View>
      ) : null}
      <AppText selectable>{body}</AppText>
      <View style={styles.footer}>
        <AppText variant="small" tone="muted" style={styles.when}>
          {when}
        </AppText>
        {actions.map((action) => (
          <Button key={action.label} variant="link" {...action} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  writer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  writerName: {
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  when: {
    flex: 1,
    minWidth: 120,
  },
});
