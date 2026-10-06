// V1 Two-head view (approved in the Screen List doc, "Seeing both drum heads"): a learner watching
// the teacher sees one head of the khol clearly and the other barely, so both faces are drawn side
// by side as the player sees them, the baya (big bass head, left hand) on the left and the dayan
// (small high head, right hand) on the right. With each bol of the taal player the zone it is
// struck on lights up (kinar, maidan, the edge of the syahi, the syahi, or the whole head for a flat
// hand), with a ripple when the stroke rings (open), in time with the sound, at any tempo, offline.
// The words under each head say the bol, the zone and the fingers (the drawing is hidden from
// screen readers; the words carry the same). Bols and strokes: lib/bols.ts (with its source).
// Drawn with react-native-svg; it re-renders only when the bol changes (lib/use-playhead.ts).

import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

import type { Bol, Head, Stroke, Zone } from '@/lib/bols';
import { spacing } from '@/theme/use-theme';

import { AppText } from './app-text';

/** Colours of the drum itself: the same in light and dark mode, like the real instrument. */
const DRUM = {
  rim: '#6B4A2B',
  kinar: '#DCC79A',
  maidan: '#EADBB8',
  syahi: '#2B2622',
  line: '#A88B5C',
  /** The struck zone: a deep saffron that stands out on the pale head and the black syahi alike. */
  lit: '#E8590C',
};

/** Radii of the zones as a share of the head's radius, from the rim inwards. */
const RINGS = {
  rim: 1,
  kinarOuter: 0.92,
  kinarInner: 0.78,
  syahi: 0.4,
};

/** The ring (outer, inner radius) of a zone, as shares of the head's radius. */
function zoneRadii(zone: Zone): [number, number] {
  switch (zone) {
    case 'kinar':
      return [RINGS.kinarOuter, RINGS.kinarInner];
    case 'maidan':
      return [RINGS.kinarInner, RINGS.syahi];
    case 'syahiEdge':
      return [RINGS.syahi + 0.07, RINGS.syahi - 0.08];
    case 'syahi':
      return [RINGS.syahi - 0.02, 0];
    case 'whole':
    default:
      return [RINGS.kinarOuter, 0];
  }
}

type FaceProps = {
  cx: number;
  cy: number;
  r: number;
  stroke: Stroke | null;
  fresh: boolean;
  lit: string;
};

/** One head, face on, with its struck zone lit. */
function Face({ cx, cy, r, stroke, fresh, lit }: FaceProps) {
  const [outer, inner] = stroke ? zoneRadii(stroke.zone) : [0, 0];
  const opacity = fresh ? 0.95 : 0.65;
  return (
    <G>
      <Circle cx={cx} cy={cy} r={r * RINGS.rim} fill={DRUM.rim} />
      <Circle cx={cx} cy={cy} r={r * RINGS.kinarOuter} fill={DRUM.kinar} />
      <Circle cx={cx} cy={cy} r={r * RINGS.kinarInner} fill={DRUM.maidan} stroke={DRUM.line} strokeWidth={1} />
      <Circle cx={cx} cy={cy} r={r * RINGS.syahi} fill={DRUM.syahi} />
      {stroke ? (
        inner === 0 ? (
          <Circle cx={cx} cy={cy} r={r * outer} fill={lit} opacity={opacity} />
        ) : (
          // A ring: a wide circle line between the two radii.
          <Circle
            cx={cx}
            cy={cy}
            r={(r * (outer + inner)) / 2}
            fill="none"
            stroke={lit}
            strokeWidth={r * (outer - inner)}
            opacity={opacity}
          />
        )
      ) : null}
      {stroke && stroke.open && fresh ? (
        <Circle cx={cx} cy={cy} r={r * 1.06} fill="none" stroke={lit} strokeWidth={3} opacity={0.7} />
      ) : null}
    </G>
  );
}

/** Props for TwoHeadView. */
export type TwoHeadViewProps = {
  /** The bol being heard, or null when nothing plays (or a rest). */
  bol: Bol | null;
  /** True just after the bol starts: lit brightly. */
  fresh: boolean;
};

/** Both faces of the khol with the zone of the current bol lit, and the same in words. */
export function TwoHeadView({ bol, fresh }: TwoHeadViewProps) {
  const { t } = useTranslation();
  const strokeOn = (head: Head) => bol?.strokes.find((s) => s.head === head && !bol.unknown) ?? null;
  const baya = strokeOn('baya');
  const dayan = strokeOn('dayan');

  const words = (head: Head, stroke: Stroke | null) =>
    stroke
      ? `${t(`practice.zones.${stroke.zone}`)} · ${t(`practice.touch.${stroke.touch}`)} · ${t(stroke.open ? 'practice.open' : 'practice.closed')}`
      : t('practice.headIdle');

  return (
    <View style={styles.wrap}>
      <AppText variant="title" style={styles.bol} accessibilityLabel={t('practice.nowPlaying', { bol: bol?.text ?? '—' })}>
        {bol && bol.text !== '-' ? bol.text : ' '}
      </AppText>
      <View aria-hidden style={styles.drawing}>
        <Svg width="100%" height="100%" viewBox="0 0 340 190">
          <Face cx={95} cy={95} r={86} stroke={baya} fresh={fresh} lit={DRUM.lit} />
          <Face cx={268} cy={95} r={58} stroke={dayan} fresh={fresh} lit={DRUM.lit} />
        </Svg>
      </View>
      <View style={styles.captions}>
        <View style={styles.caption}>
          <AppText variant="label">{t('practice.baya')}</AppText>
          <AppText variant="small" tone={baya ? 'primary' : 'muted'}>
            {words('baya', baya)}
          </AppText>
        </View>
        <View style={styles.caption}>
          <AppText variant="label">{t('practice.dayan')}</AppText>
          <AppText variant="small" tone={dayan ? 'primary' : 'muted'}>
            {words('dayan', dayan)}
          </AppText>
        </View>
      </View>
      {bol?.unknown ? (
        <AppText variant="small" tone="muted">
          {t('practice.unknownBol', { bol: bol.text })}
        </AppText>
      ) : null}
      <AppText variant="small" tone="muted">
        {t('practice.ringsLegend')}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  bol: {
    textAlign: 'center',
  },
  drawing: {
    width: '100%',
    aspectRatio: 340 / 190,
  },
  captions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  caption: {
    flex: 1,
    gap: 2,
  },
});
