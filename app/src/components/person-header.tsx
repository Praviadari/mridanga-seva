// The top of a screen about one person, e.g. a student's profile (C8) or a call (C11): their
// initials in a large saffron circle, the name, the level and status as coloured labels, and a
// line or two such as the roll number.

import { StyleSheet, View } from 'react-native';

import { spacing } from '@/theme/use-theme';

import { AppText } from './app-text';
import { Initials } from './list-row';
import { StudentChips, type StudentChipsProps } from './status-chip';

/** Props for PersonHeader. */
export type PersonHeaderProps = {
  name: string;
  /** Lines under the name, already translated. */
  details?: string[];
  /** The student's level and status as coloured labels under the name. */
  chips?: StudentChipsProps;
};

/** Initials, name and details of one person, side by side. */
export function PersonHeader({ name, details = [], chips }: PersonHeaderProps) {
  return (
    <View style={styles.row}>
      <Initials name={name} size={64} />
      <View style={styles.text}>
        <AppText variant="title">{name}</AppText>
        {chips ? <StudentChips {...chips} /> : null}
        {details.map((line) => (
          <AppText key={line} tone="muted">
            {line}
          </AppText>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  text: {
    flex: 1,
  },
});
