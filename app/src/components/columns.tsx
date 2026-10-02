// Lays a list's cards out in two columns on a wide window (a laptop, a tablet held sideways), and
// in one column on a phone, where it adds nothing to the page. Used by the lists that fill a
// screen: students (C7), follow-up calls (C10), announcements (C15, S10). Reading order is the
// same either way: left to right, then the next row.

import { Children, type PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';

import { spacing, useWide } from '@/theme/use-theme';

/** Two columns from `wideFrom` pixels wide; otherwise the children as they are. */
export function Columns({ children }: PropsWithChildren) {
  const wide = useWide();
  if (!wide) return <>{children}</>;
  return (
    <View style={styles.grid}>
      {Children.map(children, (child) => (child ? <View style={styles.cell}>{child}</View> : null))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  cell: {
    // Two per row with the gap between; a last card alone stays half width, like the others.
    flexBasis: '48%',
    flexGrow: 0,
  },
});
