// What each hand does on a stroke (docs/DECISIONS.md #404, Praveen 21-10-2026: "for taal player, add the hand
// movements too to get clarity"): under each head of the two-head view (V1), a simple drawing of the hand that plays
// it, seen from above with the fingers towards the drum, the fingers (or flat hand, or wrist and fingers) that touch
// the head lit; then the same in words with the motion: strike and lift (open, the head rings) or press and stay
// (closed, damped), as hand-drum teaching describes a muffled stroke. The left hand plays the baya, the right the
// dayan. All from lib/bols.ts (head, zone, touch, open): nothing about a stroke is decided here. The drawing is hidden
// from screen readers; the words carry the same. react-native-svg (already in the app).

import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Svg, { G, Path, Rect } from 'react-native-svg';

import type { Head, Stroke } from '@/lib/bols';
import { touchParts, type HandPart } from '@/lib/hands';
import { spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { Icon } from './icon';

/** The lit colour: the same deep saffron as the struck zone on the drum (two-head-view.tsx). */
export const HAND_LIT = '#E8590C';

/**
 * A right hand, palm down, seen from above (thumb on the left); the left hand is the same drawing mirrored. Fingers
 * point up, towards the drum. Each part with its shape in a 100 x 130 box.
 */
const SHAPES: { part: HandPart; x: number; y: number; w: number; h: number; r: number; rotate?: number }[] = [
  { part: 'heel', x: 27, y: 100, w: 46, h: 24, r: 10 },
  { part: 'palm', x: 22, y: 58, w: 56, h: 50, r: 14 },
  { part: 'thumb', x: 2, y: 66, w: 13, h: 36, r: 6.5, rotate: -32 },
  { part: 'index', x: 23, y: 16, w: 12.5, h: 48, r: 6 },
  { part: 'middle', x: 37, y: 6, w: 12.5, h: 58, r: 6 },
  { part: 'ring', x: 51, y: 12, w: 12.5, h: 52, r: 6 },
  { part: 'little', x: 65, y: 26, w: 11.5, h: 38, r: 5.5 },
];

/** Props for HandDrawing. */
export type HandDrawingProps = {
  side: 'left' | 'right';
  /** The stroke this hand plays now, or null (the hand rests). */
  stroke: Stroke | null;
  /** True just after the stroke starts: lit brightly. */
  fresh: boolean;
};

/** One hand with the parts that touch the head lit, and an arrow: up = lift (rings), down onto a line = press (damped). */
export function HandDrawing({ side, stroke, fresh }: HandDrawingProps) {
  const { colors } = useTheme();
  const lit = new Set(stroke ? touchParts(stroke.touch) : []);
  const litOpacity = fresh ? 1 : 0.75;
  return (
    <Svg width="100%" height="100%" viewBox="0 0 130 130">
      {/* The hand in the middle of a wider box, room for the motion arrow at the side. */}
      <G transform={side === 'left' ? 'translate(115 0) scale(-1 1)' : 'translate(15 0)'} opacity={stroke ? 1 : 0.45}>
        {SHAPES.map((s) => {
          const on = lit.has(s.part);
          return (
            <Rect
              key={s.part}
              x={s.x}
              y={s.y}
              width={s.w}
              height={s.h}
              rx={s.r}
              fill={on ? HAND_LIT : colors.surface}
              fillOpacity={on ? litOpacity : 1}
              stroke={on ? HAND_LIT : colors.textMuted}
              strokeWidth={2}
              transform={s.rotate ? `rotate(${s.rotate} ${s.x + s.w / 2} ${s.y + s.h / 2})` : undefined}
            />
          );
        })}
      </G>
      {stroke ? (
        stroke.open ? (
          // Strike and lift: an arrow up beside the fingertips.
          <Path
            d={side === 'left' ? 'M 8 46 L 8 12 M 1 21 L 8 12 L 15 21' : 'M 122 46 L 122 12 M 115 21 L 122 12 L 129 21'}
            stroke={HAND_LIT}
            strokeWidth={3.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        ) : (
          // Press and stay: an arrow down onto the head (a line).
          <Path
            d={
              side === 'left'
                ? 'M 8 8 L 8 38 M 1 30 L 8 38 L 15 30 M 0 46 L 16 46'
                : 'M 122 8 L 122 38 M 115 30 L 122 38 L 129 30 M 114 46 L 130 46'
            }
            stroke={colors.text}
            strokeWidth={3.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        )
      ) : null}
    </Svg>
  );
}

/** "Right hand · index finger · edge of the syahi", or that the hand rests. */
export function strokeWords(t: TFunction, head: Head, stroke: Stroke | null): string {
  const hand = t(head === 'dayan' ? 'practice.handRight' : 'practice.handLeft');
  if (!stroke) return `${hand} · ${t('practice.handRests')}`;
  return `${hand} · ${t(`practice.touch.${stroke.touch}`)} · ${t(`practice.zones.${stroke.zone}`)}`;
}

/** Props for HandCard. */
export type HandCardProps = { head: Head; stroke: Stroke | null; fresh: boolean };

/** One hand under its head: the drawing, the words, and strike-and-lift or press-and-stay. */
export function HandCard({ head, stroke, fresh }: HandCardProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={styles.card}>
      <View aria-hidden style={styles.drawing}>
        <HandDrawing side={head === 'dayan' ? 'right' : 'left'} stroke={stroke} fresh={fresh} />
      </View>
      <AppText variant="small" tone={stroke ? 'default' : 'muted'}>
        {strokeWords(t, head, stroke)}
      </AppText>
      {stroke ? (
        <View style={styles.motion}>
          <Icon name={stroke.open ? 'up' : 'down'} size={16} color={stroke.open ? HAND_LIT : colors.text} />
          <AppText variant="small" tone="primary" style={styles.motionText}>
            {t(stroke.open ? 'practice.motionOpen' : 'practice.motionClosed')}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    gap: spacing.xs,
  },
  drawing: {
    width: '100%',
    maxWidth: 150,
    aspectRatio: 1,
    alignSelf: 'center',
  },
  motion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  motionText: {
    flex: 1,
  },
});
