// "Did you know?" under the ring of the simple homes (10-10-2026, docs/DECISIONS.md #242): one short
// fact about the mṛdaṅga, its parts, care or bols, a new one each day (src/lib/fact-of-the-day.ts).
// Read-only; no data call, so it shows at once and without internet. A faint temple between lotuses
// is drawn behind it (components/home-art.tsx).

import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { factNumber } from '@/lib/fact-of-the-day';
import { cardLook, spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { TempleBackdrop } from './home-art';
import { Icon } from './icon';

/** Today's fact about the mṛdaṅga, as a quiet card. */
export function FactCard() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const key = `facts.f${factNumber(new Date())}` as const;
  return (
    <View accessible accessibilityLabel={`${t('facts.title')}. ${t(key as 'facts.f1')}`} style={[styles.card, cardLook(colors)]}>
      <TempleBackdrop />
      <Icon name="instruments" size={20} color={colors.primary} />
      <View style={styles.text}>
        <AppText variant="label" style={{ color: colors.primary }}>
          {t('facts.title')}
        </AppText>
        <AppText variant="small">{t(key as 'facts.f1')}</AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    overflow: 'hidden',
    // Room for the temple drawn behind the text (TempleBackdrop).
    minHeight: 96,
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  text: {
    flex: 1,
    gap: 2,
  },
});
