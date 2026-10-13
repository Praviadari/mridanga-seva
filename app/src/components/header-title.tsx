// The saffron header bar's title, allowed two lines (audit phase 4 P3-12, docs/DECISIONS.md #333). The
// navigation library draws it on one line, so at large text "Mark attendance", "Follow-up calls" and the Telugu
// titles ended in "…" on a small phone. Sizes follow the library's own title on each platform.

import { Platform, StyleSheet, Text, type ColorValue } from 'react-native';

/** What the header hands its title. */
type TitleProps = { children: string; tintColor?: ColorValue };

function HeaderTitle({ children, tintColor }: TitleProps) {
  return (
    <Text accessibilityRole="header" numberOfLines={2} style={[styles.title, { color: tintColor }]}>
      {children}
    </Text>
  );
}

/** screenOptions to spread into a stack's or the tabs' options: the two-line title. */
export const headerTitleOptions = { headerTitle: (props: TitleProps) => <HeaderTitle {...props} /> };

const styles = StyleSheet.create({
  title: Platform.select({
    android: { fontSize: 20, lineHeight: 28, fontFamily: 'sans-serif-medium' },
    default: { fontSize: 18, lineHeight: 26, fontWeight: '500' },
  }),
});
