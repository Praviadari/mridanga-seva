// One line of help with an ⓘ button for the rest (UI audit 14-10-2026, docs/DECISIONS.md #363). World-class apps
// open a screen with its content, not a paragraph: MoreText shows a help text's first sentence (lib/first-sentence.ts)
// and "ⓘ More" opens the rest in place: a standard disclosure button (role button, aria-expanded) for every user.
// Used for the line at the top of a screen (ScreenIntro) and for a section's description (components/section.tsx).

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { firstSentence } from '@/lib/first-sentence';
import { spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { Icon } from './icon';

/** Props for MoreText. */
export type MoreTextProps = {
  /** The whole help text, already translated. */
  text: string;
};

/** A help text's first sentence, and the rest behind "ⓘ More". */
export function MoreText({ text }: MoreTextProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const { first, rest } = firstSentence(text);
  return (
    <View style={styles.block}>
      <AppText tone="muted">
        {open || !rest ? text : first}
      </AppText>
      {rest ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={open ? t('common.less') : t('common.more')}
          aria-expanded={open}
          hitSlop={8}
          onPress={() => setOpen((was) => !was)}
          style={({ pressed }) => [styles.more, pressed && styles.pressed]}>
          <Icon name="info" size={16} color={colors.primary} />
          <AppText variant="small" tone="primary" style={styles.moreLabel}>
            {open ? t('common.less') : t('common.more')}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

/** The help line at the top of a screen. */
export function ScreenIntro({ text }: MoreTextProps) {
  return <MoreText text={text} />;
}

const styles = StyleSheet.create({
  block: {
    gap: spacing.xs,
  },
  more: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    minHeight: 32,
  },
  moreLabel: {
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
});
