// The slim line a screen shows when a refresh failed but the last loaded data is still on it (F9, #327):
// "Could not refresh. Showing what was loaded at 16:05." with Try again. See lib/kept-load.ts.

import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { localTime } from '@/lib/dates';
import { radius, spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { Button } from './button';

/** Nothing while `at` is null; else the line and Try again. */
export function RefreshFailed({ at, onRetry }: { at: number | null; onRetry: () => unknown }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  if (at === null) return null;
  return (
    <View role="status" style={[styles.row, { borderColor: colors.danger, backgroundColor: colors.dangerSurface }]}>
      <AppText style={styles.text} accessibilityLiveRegion="polite">
        {t('common.refreshFailed', { time: localTime(new Date(at).toISOString()) })}
      </AppText>
      <Button variant="link" icon="refresh" label={t('common.tryAgain')} onPress={onRetry} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  text: {
    flexGrow: 1,
    flexBasis: 200,
  },
});
