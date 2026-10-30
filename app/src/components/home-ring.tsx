// The ring on the staff homes (C1, G1), sized to the room left above the tabs so the home never scrolls (Praveen
// 30-10-2026, docs/DECISIONS.md #777; as the student home, #771). The ring sits in a box that takes the height the
// column has left under the band and the notices (Screen `compact` lets the column fill the screen); the box's own
// height, measured, sets the ring's size. Its content is drawn over the box, not inside its flow, so the box's height
// never depends on the ring: a notice that appears later shrinks the box and the ring with it, on the web too (where a
// view hears only of its own size changing, not of moving). The fact of the day (#242) stays under the ring only while
// the ring can still be RING_WITH_FACT with it. At large text the ring is the grid of tiles (module-ring.tsx), which
// is laid out as usual and scrolls rather than cut a name.

import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { spacing } from '@/theme/use-theme';

import { FactCard } from './fact-card';
import { ModuleRing, useRingAsGrid, type Module } from './module-ring';

/** The space under the bottom circle for its label, and the fact card's height until measured (as the student home). */
const LABEL_BELOW = 36;
const FACT_GUESS = 104;
/** The ring keeps the fact of the day only while it can still be this big with it. */
const RING_WITH_FACT = 300;
/** Never smaller than this (a very short window scrolls rather than squeeze the circles together). */
const RING_MIN = 260;

/** The home's ring of modules, filling the room above the tabs, and the fact of the day when there is room. */
export function HomeRing({ modules }: { modules: readonly Module[] }) {
  // The box's height once measured; null until then (the ring is unseen, so it does not show big first, then shrink).
  const [room, setRoom] = useState<number | null>(null);
  const [factHeight, setFactHeight] = useState(FACT_GUESS);
  const asGrid = useRingAsGrid(modules.length);
  if (asGrid) {
    return (
      <>
        <ModuleRing modules={modules} />
        <FactCard />
      </>
    );
  }
  // Not before the room is known: an unseen fact card would still make the page scroll for a moment.
  const withFact = room !== null && room - factHeight - spacing.sm - LABEL_BELOW >= RING_WITH_FACT;
  const ringMax = room === null ? RING_MIN : Math.max(RING_MIN, room - LABEL_BELOW - (withFact ? factHeight + spacing.sm : 0));
  return (
    <View
      style={styles.room}
      onLayout={(e) => {
        const height = Math.floor(e.nativeEvent.layout.height);
        setRoom((was) => (was !== null && Math.abs(was - height) < 1 ? was : height));
      }}>
      <View style={[styles.over, room === null && styles.unmeasured]}>
        <ModuleRing modules={modules} maxSize={ringMax} />
        {withFact ? (
          <View onLayout={(e) => setFactHeight(Math.round(e.nativeEvent.layout.height))}>
            <FactCard />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Whatever height the column has left, and never less than the smallest ring with its bottom label.
  room: {
    flexGrow: 1,
    flexBasis: 0,
    minHeight: RING_MIN + LABEL_BELOW,
  },
  // Over the box, the ring and the fact in the middle of the room.
  over: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    gap: spacing.sm,
  },
  unmeasured: {
    opacity: 0,
  },
});
