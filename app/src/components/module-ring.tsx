// The ring of modules on the home screens (C1, G1; S1 since round 5): the drum mark, the app name
// and its motto in the middle, and one coloured circle per module around it, each a button to that
// module's screen. Modules that are not built yet (Instruments, Events) carry a small "under
// construction" mark and open the Coming soon screen (docs/DECISIONS.md #39, #41). The idea comes
// from the volunteers' mockup of 2 Oct 2026, "version 3": a central menu around the drum.
// Since the simple home (10-10-2026, docs/DECISIONS.md #240) the ring is the whole home under the
// greeting, and a circle can carry a count of what waits for the person (top left, red), said in
// its accessible name ("Announcements, 3 new").
//
// When the phone's text is set large (useLargeText), or the window is very narrow, the ring would
// not hold its labels, so the same modules are shown as a grid of tiles instead. Screen readers
// get the modules in reading order either way; the drawing position does not matter to them.

import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';

import { badgeText, moduleSpokenName } from '@/lib/module-badge';
import type { ModuleTone } from '@/theme/colors';
import { cardLook, spacing, useLargeText, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { RingMandala } from './home-art';
import { Icon, IconBadge, type IconName } from './icon';
import { MridangaMark } from './mridanga-mark';

/** One module on the ring. */
export type Module = {
  /** Stable key, also the position in reading order. */
  key: string;
  icon: IconName;
  /** The name under the circle, already translated. */
  label: string;
  /** The circle's colour; saffron when left out (the modules not built yet). */
  tone?: ModuleTone;
  /** Not built yet: marked and read out as "coming soon". */
  soon?: boolean;
  /**
   * Something waiting for the person (unread announcements, polls to vote, calls due ...): a count
   * on the circle, and adgeSpoken (e.g. "3 new") added to the circle's accessible name.
   */
  badge?: number;
  badgeSpoken?: string;
  onPress: () => void;
};

/** Props for ModuleRing. */
export type ModuleRingProps = {
  /** Heading above the ring, already translated; left out on the simple homes, where the greeting is enough. */
  title?: string;
  modules: readonly Module[];
  /**
   * Modules that do not fit on the ring (simple home, #241): smaller circles four to a row
   * under it, read after the ring's.
   */
  more?: readonly Module[];
};

/** Diameter of a module's circle. */
const CIRCLE = 64;
/** Width of a module (circle plus the label under it) on the ring. */
const ITEM_WIDTH = 92;
/** Room under the lowest circle for its label. */
const LABEL_ROOM = 44;
/** Diameter of the drum circle in the middle: wide enough for the motto on one line. */
const CENTRE = 144;
/** A label may be a little wider than its circle's slot, e.g. "Announcements" in one word. */
const LABEL_OVERHANG = 14;
/** The ring is never drawn wider than this; on a laptop it sits in the middle of the column. */
const MAX_SIZE = 400;
/** A ring of four or fewer (the student home) is drawn smaller, so the circles sit close to the drum. */
const MAX_SIZE_FEW = 320;
/**
 * A ring of nine (the staff homes since round 7) draws smaller circles in narrower slots, so
 * neighbours keep a gap on a 375 px phone (nine slots of 92 px would overlap at that width).
 */
const DENSE_FROM = 9;
const CIRCLE_DENSE = 56;
const ITEM_WIDTH_DENSE = 80;
/**
 * A ring of ten (the staff homes, with Assessments since Phase 2) draws smaller circles in
 * the same slots, so the side labels stay inside a 375 px screen.
 */
const CIRCLE_TEN = 50;
/** More modules than this are shown as the grid. */
const MAX_ON_RING = 10;
/** Below this window width the labels would overlap, so the grid is used. */
const MIN_WIDTH = 340;

/** The staff home's modules, as a ring (or a grid when the text is large). */
export function ModuleRing({ title, modules, more = [] }: ModuleRingProps) {
  const { width } = useWindowDimensions();
  const largeText = useLargeText();
  const asGrid = largeText || width < MIN_WIDTH || modules.length > MAX_ON_RING;
  return (
    <View style={styles.block}>
      {title ? <AppText variant="subtitle">{title}</AppText> : null}
      {asGrid ? (
        <ModuleGrid modules={[...modules, ...more]} />
      ) : (
        <>
          <Ring modules={modules} width={width} />
          {more.length > 0 ? <CircleRow modules={more} /> : null}
        </>
      )}
    </View>
  );
}

/** Diameter of a circle in the rows under the ring. */
const CIRCLE_ROW = 48;

/** The modules that did not fit on the ring: circles four to a row. */
function CircleRow({ modules }: { modules: readonly Module[] }) {
  return (
    <View style={styles.circleRow}>
      {modules.map((module) => (
        <ModuleButton key={module.key} module={module} circle={CIRCLE_ROW} style={styles.circleCell} />
      ))}
    </View>
  );
}

/** The circles placed around the drum. */
function Ring({ modules, width }: { modules: readonly Module[]; width: number }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  // 16 px page sides; on a phone the ring fills the width, on a laptop it stops at MAX_SIZE.
  const size = Math.min(width - 2 * spacing.md, modules.length <= 4 ? MAX_SIZE_FEW : MAX_SIZE);
  const dense = modules.length >= DENSE_FROM;
  const ten = modules.length >= MAX_ON_RING;
  const circle = ten ? CIRCLE_TEN : dense ? CIRCLE_DENSE : CIRCLE;
  const itemWidth = dense ? ITEM_WIDTH_DENSE : ITEM_WIDTH;
  const radius = size / 2 - itemWidth / 2;
  const centre = size / 2;
  // As tall as the lowest circle and its label need (#241): no empty room under the ring.
  const lowest = Math.max(...modules.map((_, index) => Math.sin(-Math.PI / 2 + (index * 2 * Math.PI) / modules.length)));
  const height = Math.max(size, centre + radius * lowest + circle / 2 + LABEL_ROOM);
  return (
    <View style={[styles.ring, { width: size, height }]}>
      {/* The lotus mandala behind the circles (#241). */}
      <View style={[styles.mandala, { width: size, height: size }]}>
        <RingMandala size={size} />
      </View>
      <View
        // One element for screen readers: the app name and motto together.
        accessible
        accessibilityRole="header"
        accessibilityLabel={`${t('app.name')}, ${t('app.motto')}`}
        style={[
          styles.centre,
          {
            left: centre - CENTRE / 2,
            top: centre - CENTRE / 2,
            backgroundColor: colors.primarySoft,
            borderColor: colors.cardBorder,
          },
        ]}>
        <MridangaMark size={44} color={colors.primary} accent={colors.primarySoft} />
        <AppText variant="small" style={[styles.centreText, { color: colors.onPrimarySoft, fontWeight: '700' }]}>
          {t('app.name')}
        </AppText>
        <AppText
          variant="small"
          // The motto is one line; at a larger text size the grid is shown instead.
          maxFontSizeMultiplier={1.2}
          style={[styles.centreText, styles.motto, { color: colors.onPrimarySoft }]}>
          {t('app.motto')}
        </AppText>
      </View>
      {modules.map((module, index) => {
        // Start at the top and go clockwise.
        const angle = -Math.PI / 2 + (index * 2 * Math.PI) / modules.length;
        const left = centre + radius * Math.cos(angle) - itemWidth / 2;
        const top = centre + radius * Math.sin(angle) - circle / 2;
        return (
          <ModuleButton
            key={module.key}
            module={module}
            circle={circle}
            labelWidth={itemWidth + 2 * LABEL_OVERHANG}
            style={{ position: 'absolute', left, top, width: itemWidth }}
          />
        );
      })}
    </View>
  );
}

/** The same modules as tiles, two to a row, for large text or a very narrow window. */
function ModuleGrid({ modules }: { modules: readonly Module[] }) {
  const { colors } = useTheme();
  return (
    <View style={styles.grid}>
      {modules.map((module) => (
        <ModuleButton key={module.key} module={module} style={[styles.tile, cardLook(colors)]} />
      ))}
    </View>
  );
}

/**
 * One module: its circle with the icon, the name under it; a button. On the ring the label may be
 * wider than the circle's slot (`labelWidth`), so a long word like "Announcements" stays whole.
 */
function ModuleButton({
  module,
  style,
  labelWidth,
  circle = CIRCLE,
}: {
  module: Module;
  style: StyleProp<ViewStyle>;
  labelWidth?: number;
  /** Diameter of the circle (smaller on a ring of nine). */
  circle?: number;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const soonLook = colors.chips.warning;
  const count = badgeText(module.badge);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={moduleSpokenName(module.label, {
        count: module.badge,
        badgeSpoken: module.badgeSpoken,
        soon: module.soon ? t('comingSoon.title') : undefined,
      })}
      onPress={module.onPress}
      style={({ pressed }) => [styles.item, style, pressed && styles.pressed]}>
      <View>
        <IconBadge name={module.icon} size={circle} tone={module.tone} />
        {module.soon ? (
          <View style={[styles.soonMark, { backgroundColor: soonLook.background, borderColor: colors.background }]}>
            <Icon name="construction" size={12} color={soonLook.text} />
          </View>
        ) : null}
        {count !== null ? (
          // The count is in the accessible name above, so the badge itself is not read again.
          <View
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
            style={[styles.countMark, { backgroundColor: colors.danger, borderColor: colors.background }]}>
            <AppText variant="small" maxFontSizeMultiplier={1.2} style={[styles.countText, { color: colors.onPrimary }]}>
              {count}
            </AppText>
          </View>
        ) : null}
      </View>
      <View style={labelWidth ? { width: labelWidth } : styles.labelInTile}>
        <AppText variant="small" numberOfLines={2} maxFontSizeMultiplier={1.2} style={styles.label}>
          {module.label}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: spacing.sm,
  },
  ring: {
    alignSelf: 'center',
  },
  centre: {
    position: 'absolute',
    width: CENTRE,
    height: CENTRE,
    borderRadius: CENTRE / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  centreText: {
    textAlign: 'center',
    lineHeight: 16,
  },
  motto: {
    fontSize: 9.5,
    letterSpacing: 0.2,
  },
  item: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  label: {
    textAlign: 'center',
    fontWeight: '600',
  },
  labelInTile: {
    alignSelf: 'stretch',
  },
  soonMark: {
    position: 'absolute',
    right: -2,
    top: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countMark: {
    position: 'absolute',
    left: -6,
    top: -4,
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    fontWeight: '700',
    lineHeight: 16,
  },
  mandala: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  circleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    rowGap: spacing.sm,
  },
  circleCell: {
    width: '25%',
    minHeight: 48,
    paddingHorizontal: 2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tile: {
    flexBasis: '45%',
    flexGrow: 1,
    minHeight: 120,
    justifyContent: 'center',
    padding: spacing.sm,
  },
  pressed: {
    opacity: 0.7,
  },
});
