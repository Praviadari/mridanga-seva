// The answer cards of the Playground's choose games (docs/RHYTHM_PLAYGROUND.md §7.1, §13.5; #728): large cards (at
// least 72 dp high, two to a row on a phone) with the bol as the class writes it and, when given, a line under it
// (the hand). After the answer the chosen card and the right one say so in words and with an icon, never by colour
// alone; each card can then be heard to compare ("Hear tā"). The screen reader reads each card's name and line.
// Cards never move (no animation).

import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Icon } from '@/components/icon';
import { cardRadius, spacing, useTheme } from '@/theme/use-theme';

export type CardChoice = {
  /** The challenge's answer key (lib/playground/types.ts Choice.key). */
  key: string;
  label: string;
  /** A second line: the hand and head, "Faster", ... */
  sublabel?: string;
  /** What the screen reader says; default label + sublabel. */
  accessibilityLabel?: string;
};

export type ChoiceCardsProps = {
  choices: readonly CardChoice[];
  onChoose: (key: string) => void;
  /** The card the student chose; once set (with `rightKey`), the result shows. */
  chosen?: string | null;
  /** The right card, shown after the answer (or after the last try). */
  rightKey?: string | null;
  /** Cards cannot be chosen (while the prompt plays, or after the answer). */
  disabled?: boolean;
  /** Offered after the answer: hear one card. */
  onHear?: (key: string) => void;
};

export function ChoiceCards({ choices, onChoose, chosen = null, rightKey = null, disabled = false, onHear }: ChoiceCardsProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const answered = chosen !== null && rightKey !== null;
  return (
    <View style={styles.grid} accessibilityRole="radiogroup">
      {choices.map((c, i) => {
        const isChosen = chosen === c.key;
        const isRight = answered && rightKey === c.key;
        const state = isRight ? t('playEngine.cards.rightCard') : answered && isChosen ? t('playEngine.cards.yourChoice') : null;
        const label = c.accessibilityLabel ?? [c.label, c.sublabel].filter(Boolean).join(', ');
        return (
          <View key={`${c.key}-${i}`} style={styles.cell}>
            <Pressable
              accessibilityRole="radio"
              accessibilityLabel={state ? `${label}. ${state}` : label}
              accessibilityState={{ selected: isChosen, disabled: disabled || answered }}
              disabled={disabled || answered}
              onPress={() => onChoose(c.key)}
              style={({ pressed }) => [
                styles.card,
                {
                  backgroundColor: isRight ? colors.successSurface : pressed ? colors.primarySoft : colors.surfaceRaised,
                  borderColor: isRight ? colors.success : isChosen ? colors.primary : colors.cardBorder,
                  borderWidth: isRight || isChosen ? 3 : 1,
                },
              ]}
            >
              <AppText variant="title" family="serif" style={styles.label}>
                {c.label}
              </AppText>
              {c.sublabel ? (
                <AppText variant="small" tone="muted" style={styles.label}>
                  {c.sublabel}
                </AppText>
              ) : null}
              {state ? (
                <View style={styles.state}>
                  <Icon name={isRight ? 'check' : 'tick'} size={18} color={isRight ? colors.success : colors.text} />
                  <AppText variant="small">{state}</AppText>
                </View>
              ) : null}
            </Pressable>
            {answered && onHear ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('playEngine.cards.hear', { label: c.label })}
                onPress={() => onHear(c.key)}
                style={({ pressed }) => [styles.hear, { borderColor: colors.border, backgroundColor: pressed ? colors.primarySoft : colors.surface }]}
              >
                <Icon name="listen" size={18} />
                <AppText variant="label">{t('playEngine.cards.hear', { label: c.label })}</AppText>
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  cell: { flexBasis: '47%', flexGrow: 1, gap: spacing.xs },
  card: { minHeight: 88, borderRadius: cardRadius, padding: spacing.md, alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  label: { textAlign: 'center' },
  state: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  hear: { minHeight: 48, borderWidth: 1, borderRadius: cardRadius, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm },
});
