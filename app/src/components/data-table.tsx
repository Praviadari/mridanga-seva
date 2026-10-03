// A plain table for laptop-wide screens (the reports C21/G8; the G3 database draws its own): a
// heading row and one row per entry, each cell one line, widths as shares of the row. On a phone
// the screens show cards instead (useWide in src/theme/use-theme.ts). A row with onPress is a
// button and lights up under the mouse.

import { Pressable, StyleSheet, View } from 'react-native';

import { spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';

/** One column: its heading and its share of the width. */
export type TableColumn = { label: string; flex: number; align?: 'left' | 'right' };

/** Props for DataTable. */
export type DataTableProps = {
  columns: readonly TableColumn[];
  /** One entry per row: a key, the cells in column order, and optionally what a tap opens. */
  rows: readonly { key: string; cells: readonly string[]; label?: string; onPress?: () => void }[];
};

/** A table with a heading row. */
export function DataTable({ columns, rows }: DataTableProps) {
  const { colors } = useTheme();
  const cell = (text: string, column: TableColumn, muted: boolean, index: number) => (
    <AppText
      key={index}
      variant="small"
      tone={muted ? 'muted' : 'default'}
      numberOfLines={1}
      style={{ flex: column.flex, textAlign: column.align === 'right' ? 'right' : 'left' }}>
      {text}
    </AppText>
  );
  return (
    <View style={[styles.table, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <View style={[styles.row, styles.headRow]}>{columns.map((c, i) => cell(c.label, c, true, i))}</View>
      {rows.map((row) =>
        row.onPress ? (
          <Pressable
            key={row.key}
            accessibilityRole="button"
            accessibilityLabel={row.label}
            onPress={row.onPress}
            style={({ pressed, hovered }) => [
              styles.row,
              { borderColor: colors.border },
              (pressed || hovered) && { backgroundColor: colors.primarySoft },
            ]}>
            {row.cells.map((text, i) => cell(text, columns[i], false, i))}
          </Pressable>
        ) : (
          <View key={row.key} style={[styles.row, { borderColor: colors.border }]}>
            {row.cells.map((text, i) => cell(text, columns[i], false, i))}
          </View>
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  table: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    minHeight: 40,
  },
  headRow: {
    borderTopWidth: 0,
  },
});
