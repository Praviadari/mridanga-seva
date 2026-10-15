// The ring of modules on the home screens (C1, G1; S1 since round 5): the drum mark in the middle (only the drum since
// 14-10-2026: the band above says the name), and one coloured circle per module around it, each a button to that
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

import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';

import { badgeText, moduleSpokenName } from '@/lib/module-badge';
import { ringAngle, ringLayout, type LabelSize } from '@/lib/ring-layout';
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
/** Usual diameter of the drum circle in the middle (since 14-10-2026 only the drum is drawn in it). */
const CENTRE = 144;
/** The drum circle never shrinks below this to keep labels clear of it (lib/ring-layout.ts, #369). */
const CENTRE_MIN = 96;
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
/** A ring narrower than this (a 360 px phone) draws smaller circles and a smaller drum circle. */
const NARROW_RING = 340;
const CENTRE_NARROW = 128;
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

/** A label's size before it is measured: one line of small text, two when it is longer than its slot. */
function guessLabel(label: string, labelWidth: number): LabelSize {
  const width = label.length * 7.5 + 4;
  return { width: Math.min(width, labelWidth), height: width > labelWidth ? 40 : 20 };
}

/** The circles placed around the drum. */
function Ring({ modules, width }: { modules: readonly Module[]; width: number }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  // 16 px page sides; on a phone the ring fills the width, on a laptop it stops at MAX_SIZE.
  const size = Math.min(width - 2 * spacing.md, modules.length <= 4 ? MAX_SIZE_FEW : MAX_SIZE);
  const dense = modules.length >= DENSE_FROM;
  const ten = modules.length >= MAX_ON_RING;
  // A narrow phone (360 px): smaller circles and drum, so the top labels keep clear of the drum (#351).
  const narrow = size < NARROW_RING;
  const circle = ten ? CIRCLE_TEN : dense || narrow ? CIRCLE_DENSE : CIRCLE;
  const itemWidth = dense ? ITEM_WIDTH_DENSE : ITEM_WIDTH;
  const labelWidth = itemWidth + 2 * LABEL_OVERHANG;
  // Each label's size as drawn (any language, any text size), a guess until measured: the circles sit as far out as
  // the screen allows and the drum circle shrinks only as far as needed to keep every label clear of it (#369).
  const [measured, setMeasured] = useState<Record<string, LabelSize>>({});
  const onLabelSize = useCallback((key: string, label: LabelSize) => {
    setMeasured((was) => {
      const old = was[key];
      return old && Math.abs(old.width - label.width) < 1 && Math.abs(old.height - label.height) < 1 ? was : { ...was, [key]: label };
    });
  }, []);
  const { radius, centre: centreSize, height } = ringLayout({
    size,
    side: spacing.md,
    circle,
    labelGap: spacing.xs,
    labels: modules.map((module) => measured[module.key] ?? guessLabel(module.label, labelWidth)),
    centreMax: narrow ? CENTRE_NARROW : CENTRE,
    centreMin: CENTRE_MIN,
  });
  const centre = size / 2;
  return (
    <View style={[styles.ring, { width: size, height }]}>
      {/* The lotus mandala behind the circles (#241). */}
      <View style={[styles.mandala, { width: size, height: size }]}>
        <RingMandala size={size} />
      </View>
      <View
        // Only the drum in the centre (Praveen 14-10-2026: the band above already says the name); screen readers hear
        // the app's name and motto.
        accessible
        accessibilityRole="image"
        accessibilityLabel={`${t('app.name')}, ${t('app.motto')}`}
        style={[
          styles.centre,
          {
            left: centre - centreSize / 2,
            top: centre - centreSize / 2,
            width: centreSize,
            height: centreSize,
            borderRadius: centreSize / 2,
            backgroundColor: colors.surfaceRaised,
            borderColor: colors.ornament,
          },
        ]}>
        <MridangaMark size={Math.round(centreSize * 0.62)} color={colors.primary} accent={colors.surfaceRaised} />
      </View>
      {modules.map((module, index) => {
        // Start at the top and go clockwise.
        const angle = ringAngle(index, modules.length);
        const left = centre + radius * Math.cos(angle) - itemWidth / 2;
        const top = centre + radius * Math.sin(angle) - circle / 2;
        return (
          <ModuleButton
            key={module.key}
            module={module}
            circle={circle}
            labelWidth={labelWidth}
            onLabelSize={(label) => onLabelSize(module.key, label)}
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
        <ModuleButton key={module.key} module={module} inGrid style={[styles.tile, cardLook(colors)]} />
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
  inGrid = false,
  onLabelSize,
}: {
  module: Module;
  style: StyleProp<ViewStyle>;
  labelWidth?: number;
  /** On the ring: told the label's size as drawn, so the ring can keep it clear of the drum circle. */
  onLabelSize?: (label: LabelSize) => void;
  /** A tile of the large-text grid: the name grows with the phone's text size. */
  inGrid?: boolean;
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
        {/* Filled like the team's "version 3" mockup (#352): deep colour, light icon, a light edge and a soft shadow. */}
        <IconBadge
          name={module.icon}
          size={circle}
          tone={module.tone}
          solid
          style={[styles.solid, { borderColor: colors.surfaceRaised, boxShadow: `0 3px 8px ${colors.shadow}` }]}
        />
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
        {/* Capped only on the ring and its rows, where the slots are fixed; a tile of the large-text grid lets
            the name grow with the phone's text size (audit P3-02, #315). */}
        {/* As wide as its text (up to the slot), so its measured size is the text's own. */}
        <View
          style={onLabelSize ? styles.labelFit : null}
          onLayout={onLabelSize ? (e) => onLabelSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height }) : undefined}>
          <AppText
            variant="small"
            numberOfLines={inGrid ? 3 : 2}
            maxFontSizeMultiplier={inGrid ? undefined : 1.2}
            style={styles.label}>
            {module.label}
          </AppText>
        </View>
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
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  solid: {
    borderWidth: 3,
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
  // A ring label's box shrinks to its text (centred), so its measured size is the text's own.
  labelFit: {
    alignSelf: 'center',
    maxWidth: '100%',
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
  // A circle sinks a little when pressed (#363).
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.94 }],
  },
});
