// A labelled text box with room for a hint and an error message. Used by every form.

import { useState, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { radius, spacing, typography, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';

/** Props for TextField: every <TextInput> prop, plus the parts around the box. */
export type TextFieldProps = TextInputProps & {
  /** Label above the box, already translated. Also read out by screen readers. */
  label: string;
  /** Small help text under the box, already translated. */
  hint?: string;
  /** Error under the box, already translated. The box turns red while it is set. */
  error?: string;
  /** For passwords: hides the text and adds a Show / Hide button. */
  secret?: boolean;
  /** Lets a form move focus to this box, e.g. from email to password. */
  ref?: Ref<TextInput>;
};

/** Labelled text input in the app's style. */
export function TextField({ label, hint, error, secret, ref, style, ...inputProps }: TextFieldProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState(false);

  return (
    <View style={styles.wrapper}>
      <AppText variant="label">{label}</AppText>
      <View
        style={[
          styles.box,
          { backgroundColor: colors.surface, borderColor: error ? colors.danger : colors.controlBorder },
        ]}>
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          accessibilityHint={error ?? hint}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={secret && !revealed}
          style={[styles.input, typography.body, { color: colors.text }, style]}
          {...inputProps}
        />
        {secret ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? t('password.hideLabel') : t('password.showLabel')}
            hitSlop={spacing.sm}
            onPress={() => setRevealed(!revealed)}
            style={styles.reveal}>
            <AppText variant="small" tone="primary">
              {revealed ? t('password.hide') : t('password.show')}
            </AppText>
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <AppText variant="small" tone="danger" role="alert" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="small" tone="muted">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.xs,
  },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: radius,
    minHeight: 48,
  },
  input: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  reveal: {
    paddingHorizontal: spacing.md,
    minHeight: 48,
    justifyContent: 'center',
  },
});
