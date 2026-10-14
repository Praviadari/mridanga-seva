// The app's icons: Ionicons outline shapes from @expo/vector-icons, a font of icons that is plain
// JavaScript plus a font file, so it reaches the installed Android app as an update (no new APK;
// docs/DECISIONS.md #36). Icons are decoration next to a word: screen readers skip them and read
// the word. Use only the names listed in `IconName`, so every screen draws a thing the same way.

import Ionicons from '@expo/vector-icons/Ionicons';
import { View, type ColorValue, type StyleProp, type ViewStyle } from 'react-native';

import type { ModuleTone } from '@/theme/colors';
import { useModuleTone } from '@/theme/module-tone';
import { useTheme } from '@/theme/use-theme';

import { MridangaMark } from './mridanga-mark';

/** What each icon stands for in this app, and the Ionicons shape used for it. */
const SHAPES = {
  home: 'home-outline',
  qr: 'qr-code-outline',
  news: 'megaphone-outline',
  attendance: 'scan-outline',
  // Launch UI (#353): a group, not an arrow through a door (members read "Here now" as a map's "you are here").
  hereNow: 'people-circle-outline',
  students: 'school-outline',
  calls: 'call-outline',
  groups: 'people-outline',
  register: 'person-add-outline',
  visits: 'calendar-outline',
  // A date field that opens the calendar (date of birth).
  date: 'calendar-clear-outline',
  time: 'time-outline',
  newJoiner: 'sparkles-outline',
  level: 'ribbon-outline',
  syllabus: 'book-outline',
  // A pie chart (#353): the heartbeat looked medical.
  status: 'pie-chart-outline',
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
  // A medal (#353): the rising arrow looked like the stock market.
  promote: 'medal-outline',
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
  // Launch UI (docs/DECISIONS.md #350): the side menu's button in the staff headers.
  menu: 'menu-outline',
  todo: 'checkmark-done-circle-outline',
  // Instruments (#353): drawn as the app's own drum (components/mridanga-mark.tsx), not musical notes, which
  // Practice uses. The Ionicons name is only the fallback shape.
  drum: 'musical-notes-outline',
  settings: 'settings-outline',
  audit: 'document-lock-outline',
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
  /** The filled shape instead of the outline (the open tab, docs/DECISIONS.md #338). */
  filled?: boolean;
};

/** One icon, hidden from screen readers (the text next to it says the same). */
export function Icon({ name, size = 22, color, filled }: IconProps) {
  const { colors } = useTheme();
  if (name === 'drum') {
    // The drum's lacing is cut out of its body (transparent), so it shows on any background.
    return <MridangaMark size={Math.round(size * 1.15)} color={String(color ?? colors.text)} accent="transparent" />;
  }
  return (
    <Ionicons
      name={filled ? filledShape(name) : SHAPES[name]}
      size={size}
      color={color ?? colors.text}
      aria-hidden
    />
  );
}

/** The filled twin of an icon's outline shape (Ionicons names it without `-outline`). */
export function filledShape(name: IconName) {
  return SHAPES[name].replace(/-outline$/, '') as keyof typeof Ionicons.glyphMap;
}

/**
 * For a tab's `tabBarIcon`: the open tab shows its filled icon in a pale pill, the others the outline, so the
 * open tab is told by shape, not only by colour (audit P3-06/P3-07, docs/DECISIONS.md #338). Colour and size
 * come from the tab bar.
 */
export function tabIcon(name: IconName) {
  return function TabIcon({ color, size, focused }: { color: ColorValue; size: number; focused: boolean }) {
    const { colors } = useTheme();
    return (
      <View style={[tabPill, focused ? { backgroundColor: colors.tabActiveIndicator } : null]}>
        <Icon name={name} color={color} size={size} filled={focused} />
      </View>
    );
  };
}

const tabPill = { width: 56, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' } as const;

/** Props for IconBadge. */
export type IconBadgeProps = {
  name: IconName;
  /** Diameter of the circle in pixels. Default 40; the icon is a little over half of it. */
  size?: number;
  /**
   * A module's colour (the circles of the home screen's module ring). Left out: the colour of the module the screen
   * belongs to (theme/module-tone.ts, #354), or saffron where there is none.
   */
  tone?: ModuleTone;
  /** Saffron even inside a module's screen (the side menu, which lists every module). */
  plain?: boolean;
  /** Filled: the tone's deep colour with a light icon (the home circles, #352); otherwise a pale tint. */
  solid?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** An icon in a pale saffron circle (or a module's colour): the start of a card, a tile or an empty screen. */
export function IconBadge({ name, size = 40, tone: given, plain, solid, style }: IconBadgeProps) {
  const { colors } = useTheme();
  const screenTone = useModuleTone();
  const tone = given ?? (plain ? undefined : screenTone);
  const look =
    tone && solid
      ? { background: colors.moduleSolid[tone], icon: colors.onHeader }
      : tone
        ? colors.modules[tone]
        : { background: colors.primarySoft, icon: colors.primary };
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
      {name === 'drum' ? (
        // The drum's lacing in the circle's own colour, so it reads as a drum and not a blot.
        <MridangaMark size={Math.round(size * 0.66)} color={look.icon} accent={look.background} />
      ) : (
        <Icon name={name} size={Math.round(size * 0.55)} color={look.icon} />
      )}
    </View>
  );
}
