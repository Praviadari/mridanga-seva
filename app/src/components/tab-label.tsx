// A tab's name that may take two lines (audit P3-03, docs/DECISIONS.md #315). Expo Router's own tab label is
// one line, so "Attendance" and the Telugu names were cut ("Atten…") from about 115-130 % text, and on a 320 dp
// phone even at normal size. The bar grows for the second line (tabsScreenOptions in theme/use-theme.ts).

import type { ColorValue } from 'react-native';
import { StyleSheet } from 'react-native';

import { AppText } from './app-text';

/** Props the tab bar hands to a tabBarLabel function. */
type LabelProps = { color: ColorValue; position: 'beside-icon' | 'below-icon' };

/**
 * A tabBarLabel for a tab: the name in up to two lines, centred under the icon (or beside it in the
 * wide-screen sidebar), in the tab bar's colour for open / not open.
 * @param text the tab's name, already translated.
 */
export function tabLabel(text: string) {
  function TabLabel({ color, position }: LabelProps) {
    const beside = position === 'beside-icon';
    return (
      <AppText numberOfLines={2} style={[beside ? styles.beside : styles.below, { color }]}>
        {text}
      </AppText>
    );
  }
  return TabLabel;
}

// The same sizes as tabBarLabelStyle in theme/use-theme.ts (Telugu and Hindi letters need the taller line).
const styles = StyleSheet.create({
  below: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  beside: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
    marginLeft: 20,
  },
});
