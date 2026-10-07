// The app's icons: Ionicons outline shapes from @expo/vector-icons, a font of icons that is plain
// JavaScript plus a font file, so it reaches the installed Android app as an update (no new APK;
// docs/DECISIONS.md #36). Icons are decoration next to a word: screen readers skip them and read
// the word. Use only the names listed in `IconName`, so every screen draws a thing the same way.

import Ionicons from '@expo/vector-icons/Ionicons';
import { View, type ColorValue, type StyleProp, type ViewStyle } from 'react-native';

import type { ModuleTone } from '@/theme/colors';
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
  person: 'person-outline',
  guardian: 'shield-checkmark-outline',
  edit: 'create-outline',
  delete: 'trash-outline',
  send: 'send-outline',
  tick: 'checkmark',
  instruments: 'musical-notes-outline',
  events: 'calendar-number-outline',
  construction: 'construct-outline',
  // Round 7: syllabus editor, materials, attendance history, profile.
  library: 'library-outline',
  video: 'logo-youtube',
  pdf: 'document-text-outline',
  photo: 'image-outline',
  open: 'open-outline',
  up: 'arrow-up',
  down: 'arrow-down',
  retire: 'archive-outline',
  restore: 'arrow-undo-outline',
  profile: 'person-circle-outline',
  // Round 9: notifications inbox, reports, centres.
  bell: 'notifications-outline',
  report: 'bar-chart-outline',
  location: 'location-outline',
  download: 'download-outline',
  share: 'share-outline',
  // Assessments (Phase 2): the module, playing a recording, audio and video files, a link, a score.
  assessment: 'clipboard-outline',
  play: 'play-circle-outline',
  audio: 'mic-outline',
  videoFile: 'videocam-outline',
  link: 'link-outline',
  score: 'star-outline',
  // Promotion approval (Phase 2 slice 2): the level-up queue, a coordinator's feedback.
  promote: 'trending-up-outline',
  feedback: 'chatbubbles-outline',
  // Practice tools (Phase 2 slice 3): the module, stop, tap tempo, the taal editor.
  practice: 'musical-note-outline',
  pause: 'stop-circle-outline',
  tap: 'hand-left-outline',
  taal: 'grid-outline',
  // Media (Phase 2 slice 4): lesson-video mirror, A-B loop, zoom; recording.
  mirror: 'swap-horizontal-outline',
  loop: 'repeat-outline',
  zoom: 'expand-outline',
  record: 'radio-button-on-outline',
  lessonVideo: 'film-outline',
  // Ishtagoshti (Phase 2 slice 6): the tab, a sloka, a theme, the sloka of the day, notes, memorised.
  ishtagoshti: 'flower-outline',
  sloka: 'reader-outline',
  theme: 'albums-outline',
  today: 'today-outline',
  notes: 'journal-outline',
  memorised: 'checkmark-done-outline',
  // Events and polls (Phase 2 slice 5).
  poll: 'stats-chart-outline',
  calendarAdd: 'calendar-outline',
  cancel: 'close-circle-outline',
  performer: 'musical-notes-outline',
  attended: 'checkmark-done-outline',
  anonymous: 'eye-off-outline',
  // Class fund (Phase 2 slice 9).
  fund: 'wallet-outline',
  income: 'arrow-down-circle-outline',
  expense: 'arrow-up-circle-outline',
  // Asset labels and stocktake (0035).
  print: 'print-outline',
  stocktake: 'list-outline',
  // Account creation (0036)
  dropdown: 'chevron-down',
  close: 'close',
  lists: 'list-outline',
  about: 'id-card-outline',
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
  /** A module's colour instead of saffron (the circles of the home screen's module ring). */
  tone?: ModuleTone;
  style?: StyleProp<ViewStyle>;
};

/** An icon in a pale saffron circle (or a module's colour): the start of a card, a tile or an empty screen. */
export function IconBadge({ name, size = 40, tone, style }: IconBadgeProps) {
  const { colors } = useTheme();
  const look = tone ? colors.modules[tone] : { background: colors.primarySoft, icon: colors.primary };
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: look.background,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}>
      <Icon name={name} size={Math.round(size * 0.55)} color={look.icon} />
    </View>
  );
}
