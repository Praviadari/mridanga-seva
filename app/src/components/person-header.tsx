// The top of a screen about one person, e.g. a student's profile (C8) or a call (C11): their
// initials in a large saffron circle, the name, and a line or two such as the roll number, level
// and status.

import { StyleSheet, View } from 'react-native';

import { spacing } from '@/theme/use-theme';

import { AppText } from './app-text';
import { Initials } from './list-row';

/** Props for PersonHeader. */
export type PersonHeaderProps = {
  name: string;
  /** Lines under the name, already translated. */
  details?: string[];
};

/** Initials, name and details of one person, side by side. */
export function PersonHeader({ name, details = [] }: PersonHeaderProps) {
  return (
    <View style={styles.row}>
      <Initials name={name} size={64} />
      <View style={styles.text}>
        <AppText variant="title">{name}</AppText>
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
