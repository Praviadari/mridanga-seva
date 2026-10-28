// The facilitator's Home under the band (docs/DECISIONS.md #700-#703; Facilitator SOP 360° review, 27-10-2026, locked):
// the "Needs attention" strip (the Today boxes of components/staff-today.tsx, folded away with one tap; open unless
// the person folded it on this device), then the eleven module circles of lib/facilitator-modules.ts in the approved
// order. A phone shows three to a row, 3 + 3 + 3 + 2 with the last two centred; a wide window shows more to a row,
// same names and order; a 320 px screen at large text or the browser at 200 % shows two or one, so no label is cut
// (labels wrap, never "…"). A module with nothing built (Media) is dimmed, says Coming soon and is not a button.
// Each circle opens the module's landing screen (app/staff/modules/[key].tsx).

import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';

import type { StaffDashboard } from '@/data/home';
import { FACILITATOR_MODULES, gridColumns, moduleAllowed, type FacilitatorModule } from '@/lib/facilitator-modules';
import { readLocal, writeLocal } from '@/lib/local-storage';
import { badgeText, moduleSpokenName } from '@/lib/module-badge';
import { radii } from '@/theme/tokens.generated';
import { spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { Icon, IconBadge } from './icon';
import { StaffToday, waitingTotal } from './staff-today';

/** Diameter of a module's circle on Home. */
const CIRCLE = 64;
/** Remembers on this device that the person folded the strip away. */
const FOLDED_KEY = 'facilitator-attention-folded';

/** Props for FacilitatorModules. */
export type FacilitatorModulesProps = {
  /** profiles.role of the login (only 'guru' sees this Home; the filter is the tree's own, #704). */
  role: string | undefined;
  /** Level-ups waiting for the facilitator's decision: a count on Teaching, as on the old ring. */
  promotionsWaiting: number;
};

/** The eleven module circles (fewer for a role that may not open some). */
export function FacilitatorModules({ role, promotionsWaiting }: FacilitatorModulesProps) {
  const { t } = useTranslation();
  const { fontScale } = useWindowDimensions();
  // The grid's own width (the page column), measured; the window's until then.
  const { width: windowWidth } = useWindowDimensions();
  const [width, setWidth] = useState(windowWidth - 2 * spacing.md);
  const columns = gridColumns(width, fontScale);
  const modules = FACILITATOR_MODULES.filter((m) => moduleAllowed(m, role));
  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (Math.abs(w - width) >= 1) setWidth(w);
  };
  return (
    <View onLayout={onLayout} accessibilityRole="list" accessibilityLabel={t('facilitatorHome.title')} style={styles.grid}>
      {modules.map((module) => (
        <ModuleCircle
          key={module.key}
          module={module}
          width={`${100 / columns}%`}
          badge={module.key === 'teaching' ? promotionsWaiting : undefined}
          badgeSpoken={t('home.badges.waiting', { count: promotionsWaiting })}
        />
      ))}
    </View>
  );
}

/** One module: its circle and its name under it; a button, or a dimmed "Coming soon" when nothing is built. */
function ModuleCircle({
  module,
  width,
  badge,
  badgeSpoken,
}: {
  module: FacilitatorModule;
  width: `${number}%`;
  badge?: number;
  badgeSpoken: string;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const label = t(module.label);
  const count = badgeText(badge);
  const circle = (
    <View>
      <IconBadge
        name={module.icon}
        size={CIRCLE}
        tone={module.tone}
        solid
        style={[styles.solid, { borderColor: colors.surfaceRaised, boxShadow: `0 3px 8px ${colors.shadow}` }]}
      />
      {count !== null ? (
        // Said in the button's name, so the mark itself is not read again.
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
  );
  const name = (
    <AppText variant="small" style={styles.label}>
      {label}
    </AppText>
  );
  if (module.soon) {
    return (
      <View
        accessible
        role="listitem"
        accessibilityLabel={moduleSpokenName(label, { soon: t('comingSoon.title') })}
        aria-disabled
        accessibilityState={{ disabled: true }}
        style={[styles.cell, { width }]}>
        <View style={styles.dimmed}>
          {circle}
          {name}
        </View>
        <AppText variant="small" tone="muted" style={styles.soon}>
          {t('comingSoon.title')}
        </AppText>
      </View>
    );
  }
  return (
    <View role="listitem" style={[styles.cell, { width }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={moduleSpokenName(label, { count: badge, badgeSpoken })}
        onPress={() => router.push({ pathname: '/staff/modules/[key]', params: { key: module.key } })}
        style={({ pressed }) => [styles.press, pressed && styles.pressed]}>
        {circle}
        {name}
      </Pressable>
    </View>
  );
}

/**
 * The Home's overview of what waits (the old Today boxes, SOP p.3), as a small strip that folds away: its heading is
 * a button with the To do total, the boxes under it. Not a second menu: only the boxes' own lists open from it.
 */
export function NeedsAttention({ board }: { board: StaffDashboard | null | undefined }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [open, setOpen] = useState(() => readLocal(FOLDED_KEY) !== '1');
  const waiting = board ? waitingTotal(board) : undefined;
  const toggle = () => {
    const next = !open;
    setOpen(next);
    writeLocal(FOLDED_KEY, next ? '0' : '1');
  };
  const attention = (waiting ?? 0) > 0;
  return (
    <View style={styles.strip}>
      <Pressable
        accessibilityRole="button"
        aria-expanded={open}
        accessibilityState={{ expanded: open }}
        accessibilityLabel={[t('facilitatorHome.needsAttention'), waiting === undefined ? '' : t('home.today.waiting', { count: waiting }), open ? t('facilitatorHome.hideAttention') : t('facilitatorHome.showAttention')]
          .filter(Boolean)
          .join(', ')}
        onPress={toggle}
        style={({ pressed }) => [
          styles.stripHead,
          { borderColor: attention ? colors.warningBorder : colors.cardBorder, backgroundColor: attention ? colors.warningSurface : colors.surface },
          pressed && styles.pressedStrip,
        ]}>
        <Icon name="todo" size={18} color={attention ? colors.warning : colors.primary} />
        <AppText variant="label" style={styles.stripTitle}>
          {t('facilitatorHome.needsAttention')}
        </AppText>
        {waiting !== undefined && !open ? (
          <AppText variant="label" style={{ color: attention ? colors.text : colors.textMuted }}>
            {String(waiting)}
          </AppText>
        ) : null}
        <View style={open ? styles.chevronOpen : null}>
          <Icon name="expand" size={18} color={colors.textMuted} />
        </View>
      </Pressable>
      {open && board !== null ? <StaffToday guru board={board} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    // The last row (two of eleven on a phone) sits in the middle.
    justifyContent: 'center',
    rowGap: spacing.md,
  },
  cell: {
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  press: {
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'stretch',
    minHeight: 48,
  },
  dimmed: {
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'stretch',
    opacity: 0.45,
  },
  solid: {
    borderWidth: 3,
  },
  // Wraps onto as many lines as the language and text size need; never cut.
  label: {
    textAlign: 'center',
    fontWeight: '600',
    alignSelf: 'stretch',
  },
  soon: {
    textAlign: 'center',
    alignSelf: 'stretch',
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
  // A circle sinks a little when pressed (#363).
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.94 }],
  },
  strip: {
    gap: spacing.sm,
  },
  stripHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderRadius: radii.lg,
  },
  stripTitle: {
    flex: 1,
  },
  chevronOpen: {
    transform: [{ rotate: '180deg' }],
  },
  pressedStrip: {
    opacity: 0.7,
  },
});
