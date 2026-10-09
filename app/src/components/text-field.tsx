// A labelled text box with room for a hint and an error message. Used by every form.

import { useId, useState, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, TextInput, View, type KeyboardTypeOptions, type TextInputProps } from 'react-native';

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

/**
 * Keyboard for a typed date (15-06-2012): digits with - / . at hand. 'numbers-and-punctuation' is
 * iPhone-only, so Android showed the full letter keyboard (audit D7-15); its phone pad has the
 * digits and those signs. Times keep 'numbers-and-punctuation': they may end in am or pm.
 */
export const DATE_KEYBOARD: KeyboardTypeOptions = Platform.OS === 'android' ? 'phone-pad' : 'numbers-and-punctuation';

/** Keyboard for a number that may be negative or have a decimal point, e.g. -1.5 (mm). */
export const SIGNED_NUMBER_KEYBOARD: KeyboardTypeOptions = Platform.OS === 'android' ? 'numeric' : 'numbers-and-punctuation';

/** Labelled text input in the app's style. */
export function TextField({ label, hint, error, secret, ref, style, ...inputProps }: TextFieldProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState(false);
  // Ties the hint or error under the box to it: Android reads accessibilityHint, the web reads
  // aria-describedby (react-native-web has no accessibilityHint).
  const noteId = useId();
  const note = error ?? hint;

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
          accessibilityHint={note}
          aria-describedby={note ? noteId : undefined}
          aria-invalid={!!error}
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
        <AppText nativeID={noteId} variant="small" tone="danger" role="alert" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : hint ? (
        <AppText nativeID={noteId} variant="small" tone="muted">
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
