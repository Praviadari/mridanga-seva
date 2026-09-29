// A coloured message box: an error from the server, or a confirmation such as "check your email".

import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';

import { radius, spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';

/** Props for Notice. */
export type NoticeProps = PropsWithChildren<{
  /** 'error' is red and announced at once by screen readers; 'success' is green. */
  tone: 'error' | 'success';
  /** Optional bold first line, already translated. */
  title?: string;
}>;

/** Message box shown above or below a form. The children are the message, already translated. */
export function Notice({ tone, title, children }: NoticeProps) {
  const { colors } = useTheme();
  const isError = tone === 'error';
  return (
    <View
      role={isError ? 'alert' : 'status'}
      style={[
        styles.box,
        {
          backgroundColor: isError ? colors.dangerSurface : colors.successSurface,
          borderColor: isError ? colors.danger : colors.success,
        },
      ]}>
      {title ? (
        <AppText variant="label" tone={isError ? 'danger' : 'success'}>
          {title}
        </AppText>
      ) : null}
      <AppText>{children}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1,
    borderRadius: radius,
    padding: spacing.md,
    gap: spacing.xs,
  },
});
