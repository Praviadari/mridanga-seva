// A labelled drop-down: a box showing the choice, which opens a list to pick from. For lists too
// long for ChoiceGroup's buttons (day, month and year of birth, countries). Pure JavaScript, the same
// on phones and the web (no native picker until the next APK, docs/I18N.md P6).

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';

import { cardRadius, maxContentWidth, radius, spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { Icon } from './icon';

/** One entry of the list: the value stored and its label, already translated. */
export type SelectOption<T> = { value: T; label: string };

/** Props for SelectField. */
export type SelectFieldProps<T> = {
  /** Label above the box, already translated. Also read out by screen readers. */
  label: string;
  options: readonly SelectOption<T>[];
  /** The chosen value, or null for none yet. */
  value: T | null;
  onChange: (value: T) => void;
  /** Shown in the box while nothing is chosen. */
  placeholder?: string;
  /** Error under the box, already translated. */
  error?: string;
  hint?: string;
  /** Where the list opens while nothing is chosen (e.g. a typical year of birth). */
  startAt?: T;
  /** Red border without a message of its own (the group around it shows the message). */
  invalid?: boolean;
  /** Narrow boxes side by side (day / month / year): no label line of their own on screen. */
  compact?: boolean;
};

/** Drop-down that opens a scrollable list in a dialog. */
export function SelectField<T extends string | number>({
  label,
  options,
  value,
  onChange,
  placeholder,
  error,
  hint,
  invalid,
  compact,
  startAt,
}: SelectFieldProps<T>) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const chosen = options.find((o) => o.value === value) ?? null;
  const shown = chosen?.label ?? placeholder ?? t('select.choose');
  const startIndex = Math.max(0, options.findIndex((o) => o.value === (value ?? startAt)));

  return (
    <View style={[styles.wrapper, compact && styles.compact]}>
      <AppText variant={compact ? 'small' : 'label'} tone={compact ? 'muted' : undefined}>
        {label}
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${chosen?.label ?? t('select.nothingChosen')}`}
        accessibilityHint={error ?? hint ?? t('select.opensList')}
        onPress={() => setOpen(true)}
        style={[styles.box, { backgroundColor: colors.surface, borderColor: error || invalid ? colors.danger : colors.controlBorder }]}>
        <AppText style={styles.value} tone={chosen ? undefined : 'muted'} numberOfLines={1}>
          {shown}
        </AppText>
        <Icon name="dropdown" size={18} color={colors.textMuted} />
      </Pressable>
      {error ? (
        <AppText variant="small" tone="danger" role="alert" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="small" tone="muted">
          {hint}
        </AppText>
      ) : null}

      {/* No fade on the web: react-native-web waits for the animation's end to hide the dialog, which a
          background tab never fires. */}
      <Modal visible={open} transparent animationType={Platform.OS === 'web' ? 'none' : 'fade'} onRequestClose={() => setOpen(false)}>
        <View style={[styles.backdrop, { backgroundColor: 'rgba(0,0,0,0.45)' }]}>
          <View
            role="dialog"
            aria-modal
            accessibilityLabel={label}
            style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
            <View style={styles.sheetHeader}>
              <AppText variant="subtitle" style={styles.sheetTitle}>
                {label}
              </AppText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('select.close')}
                hitSlop={spacing.sm}
                onPress={() => setOpen(false)}
                style={styles.close}>
                <Icon name="close" />
              </Pressable>
            </View>
            <FlatList
              data={options}
              keyExtractor={(o) => String(o.value)}
              initialScrollIndex={options.length > 12 ? startIndex : undefined}
              // Short lists (days, months, years) are drawn whole, so every entry is there at once.
              initialNumToRender={Math.min(options.length, 120)}
              getItemLayout={(_, index) => ({ length: ROW, offset: ROW * index, index })}
              role="radiogroup"
              renderItem={({ item }) => {
                const selected = item.value === value;
                return (
                  <Pressable
                    accessibilityRole="radio"
                    aria-checked={selected}
                    accessibilityLabel={item.label}
                    onPress={() => {
                      onChange(item.value);
                      setOpen(false);
                    }}
                    style={[styles.row, selected && { backgroundColor: colors.primarySoft }]}>
                    <AppText style={[styles.value, selected && { color: colors.onPrimarySoft }]}>{item.label}</AppText>
                    {selected ? <Icon name="tick" size={18} color={colors.onPrimarySoft} /> : null}
                  </Pressable>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

/** Height of one row of the list (also tells FlatList where to start). */
const ROW = 48;

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.xs,
  },
  compact: {
    flex: 1,
    minWidth: 0,
  },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: radius,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  value: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
  },
  sheet: {
    width: '100%',
    maxWidth: maxContentWidth,
    maxHeight: '80%',
    borderRadius: cardRadius,
    borderWidth: 1,
    paddingBottom: spacing.sm,
    overflow: 'hidden',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.md,
    paddingVertical: spacing.sm,
  },
  sheetTitle: {
    flex: 1,
  },
  close: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    height: ROW,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
});
