// The app's icons: Ionicons outline shapes from @expo/vector-icons, a font of icons that is plain
// JavaScript plus a font file, so it reaches the installed Android app as an update (no new APK;
// docs/DECISIONS.md #36). Icons are decoration next to a word: screen readers skip them and read
// the word. Use only the names listed in `IconName`, so every screen draws a thing the same way.

import Ionicons from '@expo/vector-icons/Ionicons';
import { View, type ColorValue, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/use-theme';

/** What each icon stands for in this app, and the Ionicons shape used for it. */
const SHAPES = {
  home: 'home-outline',
  qr: 'qr-code-outline',
  news: 'megaphone-outline',
  attendance: 'scan-outline',
  hereNow: 'enter-outline',
  students: 'school-outline',
  calls: 'call-outline',
  groups: 'people-outline',
  register: 'person-add-outline',
  visits: 'calendar-outline',
  time: 'time-outline',
  newJoiner: 'sparkles-outline',
  level: 'ribbon-outline',
  syllabus: 'book-outline',
  status: 'pulse-outline',
  pin: 'pin-outline',
  file: 'document-attach-outline',
  reply: 'chatbubble-outline',
  search: 'search-outline',
  filter: 'options-outline',
  check: 'checkmark-circle-outline',
  alert: 'alert-circle-outline',
  info: 'information-circle-outline',
  refresh: 'refresh-outline',
  language: 'language-outline',
  signOut: 'log-out-outline',
  chevron: 'chevron-forward',
  add: 'add',
  update: 'cloud-download-outline',
} as const;

/** The icons the app may use. */
export type IconName = keyof typeof SHAPES;

/** Props for Icon. */
export type IconProps = {
  name: IconName;
  /** Width and height in pixels. Default 22. */
  size?: number;
  /** Default: the main text colour. */
  color?: ColorValue;
};

/** One icon, hidden from screen readers (the text next to it says the same). */
export function Icon({ name, size = 22, color }: IconProps) {
  const { colors } = useTheme();
  return (
    <Ionicons
      name={SHAPES[name]}
      size={size}
      color={color ?? colors.text}
      aria-hidden
    />
  );
}

/** For a tab's `tabBarIcon`: the icon in the colour (saffron when open) and size the tab bar gives. */
export function tabIcon(name: IconName) {
  return function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Icon name={name} color={color} size={size} />;
  };
}

/** Props for IconBadge. */
export type IconBadgeProps = {
  name: IconName;
  /** Diameter of the circle in pixels. Default 40; the icon is a little over half of it. */
  size?: number;
  style?: StyleProp<ViewStyle>;
};

/** An icon in a pale saffron circle: the start of a card, a tile or an empty screen. */
export function IconBadge({ name, size = 40, style }: IconBadgeProps) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.primarySoft,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}>
      <Icon name={name} size={Math.round(size * 0.55)} color={colors.primary} />
    </View>
  );
}
