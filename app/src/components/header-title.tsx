// The saffron header bar's title, readable whole at large text (audit phase 4 P3-12, docs/DECISIONS.md #333).
// The navigation library draws it on one line, so at large text "Mark attendance", "Follow-up calls" and the
// Telugu titles ended in "…" on a small phone. The phone's header bar has a fixed height, so there the title
// shrinks to fit its line (down to 60 %) instead of wrapping into a second line the bar would cut off; the web's
// header has room for a second line. Sizes follow the library's own title on each platform.

import { Platform, StyleSheet, Text, type ColorValue } from 'react-native';

/** What the header hands its title. */
type TitleProps = { children: string; tintColor?: ColorValue };

function HeaderTitle({ children, tintColor }: TitleProps) {
  const fit = Platform.OS === 'android' || Platform.OS === 'ios';
  return (
    <Text
      accessibilityRole="header"
      numberOfLines={fit ? 1 : 2}
      adjustsFontSizeToFit={fit}
      minimumFontScale={0.6}
      style={[styles.title, { color: tintColor }]}>
      {children}
    </Text>
  );
}

/** screenOptions to spread into a stack's or the tabs' options: the title that fits. */
export const headerTitleOptions = { headerTitle: (props: TitleProps) => <HeaderTitle {...props} /> };

const styles = StyleSheet.create({
  title: Platform.select({
    android: { fontSize: 20, lineHeight: 28, fontFamily: 'sans-serif-medium' },
    default: { fontSize: 18, lineHeight: 26, fontWeight: '500' },
  }),
});
