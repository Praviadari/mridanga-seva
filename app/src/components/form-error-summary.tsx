// A red note beside a long form's submit button when the form was refused for its own fields:
// the messages sit under each field, often scrolled out of view, so without it the button seems
// to do nothing (DECISIONS #105). Screen readers hear it too (Notice announces errors).
// Since #323 (audit P1-11, the GOV.UK error summary): given the form's fields, it lists each problem as
// a link that takes the person to that field; a refusal from the server shows here too, beside the
// button, not at the top of a long form.

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { announce } from '@/lib/announce';
import { radius, spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { Icon } from './icon';
import { Notice } from './notice';

/** A field of the form, in page order, with its label (already translated). */
export type SummaryField = { key: string; label: string };

/** Props for FormErrorSummary. */
export type FormErrorSummaryProps = {
  /** The form's error object: one entry per field (a message key or text), empty or undefined when the field is fine. */
  errors: object;
  /** The fields in page order; with them each problem is listed as a link to its field. */
  fields?: readonly SummaryField[];
  /** Takes the person to a field: scrolls to it and gives it the cursor (useFormFocus's focusField / focusFirst). */
  onGoTo?: (key: string) => void;
  /** A refusal or failure from the server, already translated, shown beside the button. */
  serverError?: string | null;
};

/** The problems to list: the fields with an error, in page order, with their message. */
export function summaryItems(errors: object, fields: readonly SummaryField[], text: (value: string) => string) {
  const values = errors as Record<string, unknown>;
  return fields.flatMap((field) => {
    const value = values[field.key];
    return value ? [{ key: field.key, label: field.label, message: typeof value === 'string' ? text(value) : '' }] : [];
  });
}

/**
 * Shows the fields that need a fix while any has an error (as links when `fields` is given), and the
 * server's message; nothing otherwise.
 */
export function FormErrorSummary({ errors, fields, onGoTo, serverError }: FormErrorSummaryProps) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const count = Object.values(errors).filter(Boolean).length;
  const text = (value: string) => (i18n.exists(value) ? t(value as never) : value);
  const items = fields ? summaryItems(errors, fields, text) : [];
  const title = t('common.fixFieldsTitle', { count: items.length });
  const spoken = items.length > 0 ? [title, ...items.map((i) => (i.message ? `${i.label}: ${i.message}` : i.label))].join('. ') : '';
  useEffect(() => announce(spoken), [spoken]);

  return (
    <>
      {count > 0 && items.length === 0 ? <Notice tone="error">{t('common.fixFieldsAbove', { count })}</Notice> : null}
      {items.length > 0 ? (
        <View role="alert" style={[styles.box, { backgroundColor: colors.dangerSurface, borderColor: colors.danger }]}>
          <Icon name="alert" size={22} color={colors.danger} />
          <View style={styles.text}>
            <AppText variant="label" tone="danger">
              {title}
            </AppText>
            {items.map((item) => (
              <Pressable
                key={item.key}
                accessibilityRole="link"
                accessibilityHint={t('common.goToField')}
                onPress={() => onGoTo?.(item.key)}
                style={styles.item}>
                <AppText tone="danger" style={styles.link}>
                  {item.message ? `${item.label}: ${item.message}` : item.label}
                </AppText>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
      {serverError ? <Notice tone="error">{serverError}</Notice> : null}
    </>
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
  item: {
    minHeight: 44,
    justifyContent: 'center',
  },
  link: {
    textDecorationLine: 'underline',
  },
});
