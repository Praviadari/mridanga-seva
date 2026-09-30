// One private reply to an announcement: who wrote it, the text, and when. Shown to the author and
// the Guru on C15 (every reply), and to a student on S10 (only their own). Optionally one small
// action under it, such as the Guru's "Delete".

import { StyleSheet, View } from 'react-native';

import { radius, spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { Button, type ButtonProps } from './button';

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

/** A bordered card for one reply. */
export function ReplyCard({ writer, body, when, actions = [] }: ReplyCardProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {writer ? <AppText variant="label">{writer}</AppText> : null}
      <AppText selectable>{body}</AppText>
      <AppText variant="small" tone="muted">
        {when}
      </AppText>
      {actions.map((action) => (
        <Button key={action.label} variant="link" {...action} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius,
    padding: spacing.md,
    gap: spacing.xs,
  },
});
