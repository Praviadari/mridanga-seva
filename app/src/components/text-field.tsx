// A labelled text box with room for a hint and an error message. Used by every form.
// Since #323 (audit phase 1 B4: P1-09, F5-08, F5-10..F5-15): a `kind` preset sets the keyboard, autocorrect
// and length for names, emails, phones, numbers, dates, times and links; digits typed on a Telugu or Hindi
// keyboard become 0-9 in number-like boxes; the hint stays when the error shows (the error under it); the
// box shows when it has the cursor and when it is read-only; long boxes count characters; a multiline box
// starts several lines tall.

import { useId, useState, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, TextInput, View, type KeyboardTypeOptions, type TextInputProps } from 'react-native';

import { asciiDigits } from '@/lib/digits';
import { radius, spacing, typography, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';

/**
 * What a box holds, for its keyboard and checks (#323). Every prop a preset sets can still be given:
 * the caller's value wins.
 * - name: a person's name (no autocorrect: Gboard "corrects" Indian names; words capitalised)
 * - email, url: no capitals, no autocorrect, the matching keyboard
 * - phone: the phone pad, at most 20 characters (the database keeps up to 30)
 * - number: whole numbers (minutes, a PIN code, a setting); decimal: an amount
 * - date: day-month-year; time: e.g. 18:30 or 6:30 pm
 * - code: a code to copy exactly (no capitals, no autocorrect)
 */
export type FieldKind = 'name' | 'email' | 'url' | 'phone' | 'number' | 'decimal' | 'date' | 'time' | 'code';

/** Props for TextField: every <TextInput> prop, plus the parts around the box. */
export type TextFieldProps = TextInputProps & {
  /** Label above the box, already translated. Also read out by screen readers. */
  label: string;
  /** Small help text under the box, already translated. Stays when an error shows. */
  hint?: string;
  /** Error under the box (under the hint), already translated. The box turns red while it is set. */
  error?: string;
  /** For passwords: hides the text and adds a Show / Hide button. */
  secret?: boolean;
  /** Lets a form move focus to this box, e.g. from email to password. */
  ref?: Ref<TextInput>;
  /** What the box holds: sets its keyboard, autocorrect and length (#323). */
  kind?: FieldKind;
  /**
   * The real limit to count against, when maxLength lets a few more characters in so the form can say
   * "too long" (F5-15). Without it a box with maxLength of COUNTER_FROM or more counts against maxLength.
   */
  counter?: number;
  /**
   * The form cannot be sent without it. Screen readers say so (web aria-required; on the phone ", required"
   * after the label); the screen looks the same (audit F5-13, docs/DECISIONS.md #332).
   */
  required?: boolean;
};

/**
 * Keyboard for a typed date (15-06-2012): digits with - / . at hand. 'numbers-and-punctuation' is
 * iPhone-only, so Android showed the full letter keyboard (audit D7-15); its phone pad has the
 * digits and those signs. Times keep 'numbers-and-punctuation': they may end in am or pm.
 */
export const DATE_KEYBOARD: KeyboardTypeOptions = Platform.OS === 'android' ? 'phone-pad' : 'numbers-and-punctuation';

/** Keyboard for a number that may be negative or have a decimal point, e.g. -1.5 (mm). */
export const SIGNED_NUMBER_KEYBOARD: KeyboardTypeOptions = Platform.OS === 'android' ? 'numeric' : 'numbers-and-punctuation';

/** A box at least this long shows how many characters are used (F5-15). */
export const COUNTER_FROM = 200;

/** The props each kind sets (#323). A time allows 11 characters: "12:15 a.m." (F4-15). */
export function kindProps(kind: FieldKind | undefined): Partial<TextInputProps> {
  switch (kind) {
    case 'name':
      return { autoCorrect: false, autoCapitalize: 'words', spellCheck: false };
    case 'email':
      return { keyboardType: 'email-address', autoCapitalize: 'none', autoCorrect: false, spellCheck: false, maxLength: 200 };
    case 'url':
      return { keyboardType: 'url', autoCapitalize: 'none', autoCorrect: false, spellCheck: false, maxLength: 500 };
    case 'phone':
      return { keyboardType: 'phone-pad', autoCorrect: false, maxLength: 20 };
    case 'number':
      return { keyboardType: 'number-pad', autoCorrect: false };
    case 'decimal':
      return { keyboardType: 'decimal-pad', autoCorrect: false };
    case 'date':
      return { keyboardType: DATE_KEYBOARD, autoCorrect: false, maxLength: 10 };
    case 'time':
      return { keyboardType: 'numbers-and-punctuation', autoCorrect: false, maxLength: 11 };
    case 'code':
      return { autoCapitalize: 'none', autoCorrect: false, spellCheck: false };
    default:
      return {};
  }
}

/** Keyboards that type digits: what is typed there has Telugu and Devanagari digits read as 0-9 (P1-09). */
const DIGIT_KEYBOARDS: readonly (KeyboardTypeOptions | undefined)[] = ['number-pad', 'decimal-pad', 'numeric', 'phone-pad', 'numbers-and-punctuation'];

/** True when the box reads native digits as 0-9: a number-like kind or keyboard. */
export function readsDigits(kind: FieldKind | undefined, keyboardType: KeyboardTypeOptions | undefined): boolean {
  return kind === 'phone' || kind === 'number' || kind === 'decimal' || kind === 'date' || kind === 'time' || DIGIT_KEYBOARDS.includes(keyboardType);
}

/** Labelled text input in the app's style. */
export function TextField({ label, hint, error, secret, ref, required, style, kind, counter, ...inputProps }: TextFieldProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState(false);
  const [focused, setFocused] = useState(false);
  // Ties the hint and the error under the box to it: Android reads accessibilityHint, the web reads
  // aria-describedby (react-native-web has no accessibilityHint).
  const hintId = useId();
  const errorId = useId();
  const props = { ...kindProps(kind), ...inputProps };
  const { onChangeText, onFocus, onBlur, editable, multiline, maxLength, value } = props;
  const readOnly = editable === false;
  const digits = readsDigits(kind, props.keyboardType);
  const countTo = counter ?? (typeof maxLength === 'number' && maxLength >= COUNTER_FROM ? maxLength : undefined);
  const counted = countTo !== undefined && typeof value === 'string';
  const described = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <View style={styles.wrapper}>
      <AppText variant="label">{label}</AppText>
      <View
        style={[
          styles.box,
          {
            backgroundColor: readOnly ? colors.background : colors.surface,
            borderColor: error ? colors.danger : focused ? colors.primary : readOnly ? colors.border : colors.controlBorder,
          },
          focused && !readOnly && styles.focused,
        ]}>
        <TextInput
          ref={ref}
          accessibilityLabel={required && Platform.OS !== 'web' ? `${label}, ${t('common.required')}` : label}
          aria-required={required || undefined}
          accessibilityHint={[hint, error].filter(Boolean).join('. ') || undefined}
          aria-describedby={described || undefined}
          aria-invalid={!!error}
          aria-readonly={readOnly || undefined}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={secret && !revealed}
          style={[styles.input, typography.body, { color: colors.text }, multiline && styles.multiline, style]}
          {...props}
          onChangeText={onChangeText && digits ? (text) => onChangeText(asciiDigits(text)) : onChangeText}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
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
      {hint ? (
        <AppText nativeID={hintId} variant="small" tone="muted">
          {hint}
        </AppText>
      ) : null}
      {error ? (
        <AppText nativeID={errorId} variant="small" tone="danger" role="alert" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : null}
      {counted ? (
        <AppText variant="small" tone={value.length > countTo ? 'danger' : 'muted'} style={styles.counter}>
          {t('common.charactersUsed', { used: value.length, max: countTo })}
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
  focused: {
    borderWidth: 2,
  },
  input: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  // F5-11: a box for a paragraph looks like one, about four lines; a caller's style still wins.
  multiline: {
    minHeight: 112,
    textAlignVertical: 'top',
  },
  reveal: {
    paddingHorizontal: spacing.md,
    minHeight: 48,
    justifyContent: 'center',
  },
  counter: {
    alignSelf: 'flex-end',
  },
});
