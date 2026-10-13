// One row in a list of people, e.g. a student in the attendance search or in "Who is here now":
// the name, a line or two of details, and optionally one button on the right. A row can also
// open something when tapped, e.g. the student's profile from the student list; it then ends in
// an arrow. A row about a person can start with their initials in a circle. With large text (about 130 % or more)
// the button goes under the name instead of beside it, so the name keeps the row's width (audit P3-01, #315).

import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { cardLook, spacing, useLargeText, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { Button, type ButtonProps } from './button';
import { Icon, IconBadge, type IconName } from './icon';
import { StudentChips, studentChipsText, type StudentChipsProps } from './status-chip';

/** Props for ListRow. */
export type ListRowProps = {
  /** Main line, e.g. the student's name. */
  title: string;
  /** Smaller lines under the title, already translated, e.g. roll number and level. */
  details?: string[];
  /**
   * Draws the row in the "confirmed" green, e.g. for a student who is checked in, so the state
   * can be seen at a glance without reading. The same as highlight="confirmed".
   */
  highlighted?: boolean;
  /**
   * 'confirmed' = green with a tick: done, present, approved. 'attention' = amber with an alert sign:
   * something waits for someone to act (overdue, to approve, still open; audit P3-09, docs/DECISIONS.md #338).
   * The row's words still say the state; colour and sign only help.
   */
  highlight?: 'confirmed' | 'attention';
  /**
   * One button at the right end of the row. Screen readers hear its label with the row's title,
   * e.g. "Check in, Arjun Rao", so the many same buttons of a list can be told apart.
   */
  action?: Pick<ButtonProps, 'label' | 'onPress' | 'loading' | 'disabled' | 'variant' | 'accessibilityLabel'>;
  /**
   * Called when the row itself is tapped. Makes the whole row one button for screen readers, so
   * do not combine it with `action`: on phones a screen reader cannot reach a button inside it.
   */
  onPress?: () => void;
  /**
   * What starts the row: 'initials' = the first letters of `title` in a circle (for a person),
   * or an icon in a circle. Default none.
   */
  leading?: 'initials' | IconName;
  /** A student's level and status as coloured labels under the title. */
  chips?: StudentChipsProps;
  /** A line in red with a warning sign under the details, e.g. a flagged check-in. */
  warning?: string;
};

/** A card-like row with a title, details and an optional button; tappable when `onPress` is given. */
export function ListRow({ title, details = [], highlighted, highlight, action, onPress, leading, chips, warning }: ListRowProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const large = useLargeText();
  const mark = highlight ?? (highlighted ? 'confirmed' : undefined);
  const look = [
    cardLook(colors),
    mark === 'confirmed' ? { backgroundColor: colors.successSurface, borderColor: colors.success, borderLeftWidth: 4 } : null,
    mark === 'attention' ? { backgroundColor: colors.warningSurface, borderColor: colors.warningBorder, borderLeftWidth: 4 } : null,
    // Room for the button on a line of its own (RowContent).
    large && action ? styles.wrap : null,
  ];
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[title, ...(chips ? studentChipsText(t, chips) : []), ...details, ...(warning ? [warning] : [])].join(', ')}
        onPress={onPress}
        style={({ pressed }) => [styles.row, look, pressed && styles.pressed]}>
        <RowContent title={title} details={details} action={action} leading={leading} chips={chips} warning={warning} mark={mark} />
        {action ? null : <Icon name="chevron" size={18} color={colors.textMuted} />}
      </Pressable>
    );
  }
  return (
    <View style={[styles.row, look]}>
      <RowContent title={title} details={details} action={action} leading={leading} chips={chips} warning={warning} mark={mark} />
    </View>
  );
}

/** The inside of a row: the leading circle, the text column and the button. */
function RowContent({
  title,
  details = [],
  action,
  leading,
  chips,
  warning,
  mark,
}: Pick<ListRowProps, 'title' | 'details' | 'action' | 'leading' | 'chips' | 'warning'> & { mark?: ListRowProps['highlight'] }) {
  const { colors } = useTheme();
  const large = useLargeText();
  const button = action ? <Button {...action} accessibilityLabel={action.accessibilityLabel ?? `${action.label}, ${title}`} /> : null;
  return (
    <>
      {leading === 'initials' ? <Initials name={title} /> : leading ? <IconBadge name={leading} size={40} /> : null}
      <View style={styles.text}>
        {mark ? (
          <View style={styles.titleLine}>
            <Icon name={mark === 'confirmed' ? 'check' : 'alert'} size={18} color={mark === 'confirmed' ? colors.success : colors.warning} />
            <AppText variant="label" style={styles.titleText}>
              {title}
            </AppText>
          </View>
        ) : (
          <AppText variant="label">{title}</AppText>
        )}
        {chips ? <StudentChips {...chips} /> : null}
        {details.map((line) => (
          <AppText key={line} variant="small" tone="muted">
            {line}
          </AppText>
        ))}
        {warning ? (
          <View style={styles.warning}>
            <Icon name="alert" size={16} color={colors.danger} />
            <AppText variant="small" tone="danger" style={styles.warningText}>
              {warning}
            </AppText>
          </View>
        ) : null}
      </View>
      {button && large ? <View style={styles.actionUnder}>{button}</View> : button}
    </>
  );
}

/**
 * First letters of the first two words of a name, in a saffron circle, e.g. "AR" for Arjun Rao.
 * `size` is the circle's diameter in pixels (default 40). Hidden from screen readers: the name is
 * always written next to it.
 */
export function Initials({ name, size = 40 }: { name: string; size?: number }) {
  const { colors } = useTheme();
  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? '')
    .join('')
    .toUpperCase();
  return (
    <View
      aria-hidden
      style={[
        styles.initials,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.primarySoft },
      ]}>
      <AppText variant={size >= 56 ? 'subtitle' : 'label'} maxFontSizeMultiplier={1.3} style={{ color: colors.onPrimarySoft }}>
        {letters}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  text: {
    flex: 1,
    gap: spacing.xs,
  },
  wrap: {
    flexWrap: 'wrap',
  },
  // The whole width, so the button starts a new line under the name.
  actionUnder: {
    flexBasis: '100%',
    alignItems: 'flex-start',
  },
  titleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  titleText: {
    flexShrink: 1,
  },
  warning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  warningText: {
    flexShrink: 1,
  },
  initials: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
