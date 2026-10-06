// A coloured message box: an error from the server, or a confirmation such as "check your email".

import { useEffect, type PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';

import { announce, textOf } from '@/lib/announce';
import { radius, spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { Icon } from './icon';

/** Props for Notice. */
export type NoticeProps = PropsWithChildren<{
  /**
   * 'error' is red; 'success' is green; 'info' is plain, for news that is neither, e.g. "already
   * checked in, nothing changed".
   */
  tone: 'error' | 'success' | 'info';
  /** Optional bold first line, already translated. */
  title?: string;
  /**
   * Speak the message on TalkBack / VoiceOver when it appears or changes (src/lib/announce.ts).
   * Default: on for 'error' and 'success', off for 'info', which is mostly standing help text;
   * pass true for an info box that reports a result.
   */
  announced?: boolean;
}>;

/** Message box shown above or below a form. The children are the message, already translated. */
export function Notice({ tone, title, announced = tone !== 'info', children }: NoticeProps) {
  const { colors } = useTheme();
  const spoken = announced ? [title, textOf(children)].filter(Boolean).join('. ') : '';
  useEffect(() => announce(spoken), [spoken]);
  const look = {
    error: { background: colors.dangerSurface, border: colors.danger, titleTone: 'danger', icon: 'alert', iconColour: colors.danger },
    success: { background: colors.successSurface, border: colors.success, titleTone: 'success', icon: 'check', iconColour: colors.success },
    info: { background: colors.surface, border: colors.border, titleTone: 'default', icon: 'info', iconColour: colors.primary },
  } as const;
  return (
    <View
      role={tone === 'error' ? 'alert' : 'status'}
      style={[styles.box, { backgroundColor: look[tone].background, borderColor: look[tone].border }]}>
      <Icon name={look[tone].icon} size={22} color={look[tone].iconColour} />
      <View style={styles.text}>
        {title ? (
          <AppText variant="label" tone={look[tone].titleTone}>
            {title}
          </AppText>
        ) : null}
        <AppText>{children}</AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: radius,
    padding: spacing.md,
    gap: spacing.sm,
  },
  text: {
    flex: 1,
    gap: spacing.xs,
  },
});
