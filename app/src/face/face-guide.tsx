// Face scan (Phase 3, docs/DECISIONS.md #437): the guide drawn over the live camera, so the person sees the scan
// working, as in other face-check apps. The view outside a face-shaped oval is dimmed; the oval's border is white
// until a face is seen, gold while the blink/turn prompts run, green while the pictures are taken (red if the scan
// stopped); a ring fills round the oval with each picture and flashes once per picture; a soft light sweeps up and
// down inside the oval while the camera works. Phone setting "Remove animations": no sweep and no flash. Drawing
// only: touches pass through and screen readers skip it (the prompt under the camera says what to do).

import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { useReducedMotion } from '@/lib/reduced-motion';

import { ellipsePerimeter, guideOval, guideSweeps, type GuideTone } from './face-guide-state';

const TONE: Record<GuideTone, string> = {
  search: 'rgba(255,255,255,0.9)',
  found: '#E0B25C',
  capture: '#43A047',
  done: '#43A047',
  failed: '#E53935',
};

type Props = {
  tone: GuideTone;
  /** 0..1: how much of the ring is filled. */
  progress: number;
  /** Changes once per picture taken: each change flashes the ring. */
  pictures: number;
};

/** The oval guide over the camera (absolutely placed over its box). */
export function FaceGuide({ tone, progress, pictures }: Props) {
  const still = useReducedMotion();
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [sweep] = useState(() => new Animated.Value(0));
  const [flash] = useState(() => new Animated.Value(0));
  const sweeping = guideSweeps(tone, still);

  useEffect(() => {
    if (!sweeping) {
      sweep.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sweep, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(sweep, { toValue: 0, duration: 1400, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [sweep, sweeping]);

  useEffect(() => {
    if (pictures === 0 || still) return;
    flash.setValue(1);
    Animated.timing(flash, { toValue: 0, duration: 450, useNativeDriver: true }).start();
  }, [flash, pictures, still]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (!size || size.width !== width || size.height !== height) setSize({ width, height });
  };

  if (!size) return <View style={StyleSheet.absoluteFill} onLayout={onLayout} pointerEvents="none" />;

  const { width, height } = size;
  const { cx, cy, rx, ry } = guideOval(width, height);
  // The oval as a path that starts at the top and runs clockwise, so the ring fills from 12 o'clock.
  const oval = `M ${cx} ${cy - ry} a ${rx} ${ry} 0 1 1 0 ${2 * ry} a ${rx} ${ry} 0 1 1 0 ${-2 * ry} Z`;
  const shade = `M 0 0 H ${width} V ${height} H 0 Z ${oval}`;
  const ring = ellipsePerimeter(rx, ry);
  const color = TONE[tone];
  const band = Math.max(18, ry * 0.18);
  const travel = 2 * ry - band;

  return (
    <View
      style={StyleSheet.absoluteFill}
      onLayout={onLayout}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      {sweeping ? (
        <View style={[styles.clip, { left: cx - rx, top: cy - ry, width: 2 * rx, height: 2 * ry, borderRadius: rx }]}>
          <Animated.View
            style={{
              height: band,
              transform: [{ translateY: sweep.interpolate({ inputRange: [0, 1], outputRange: [0, travel] }) }],
            }}>
            <Svg width={2 * rx} height={band}>
              <Defs>
                <LinearGradient id="faceSweep" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={color} stopOpacity="0" />
                  <Stop offset="0.5" stopColor={color} stopOpacity="0.55" />
                  <Stop offset="1" stopColor={color} stopOpacity="0" />
                </LinearGradient>
              </Defs>
              <Path d={`M 0 0 H ${2 * rx} V ${band} H 0 Z`} fill="url(#faceSweep)" />
            </Svg>
          </Animated.View>
        </View>
      ) : null}
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Path d={shade} fill="rgba(0,0,0,0.45)" fillRule="evenodd" />
        <Path d={oval} fill="none" stroke={color} strokeOpacity={0.45} strokeWidth={3} />
        {progress > 0 ? (
          <Path
            d={oval}
            fill="none"
            stroke={color}
            strokeWidth={6}
            strokeLinecap="round"
            strokeDasharray={`${ring} ${ring}`}
            strokeDashoffset={ring * (1 - progress)}
          />
        ) : null}
      </Svg>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: flash }]}>
        <Svg width={width} height={height}>
          <Path d={oval} fill="none" stroke="#FFFFFF" strokeWidth={10} strokeOpacity={0.85} />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { position: 'absolute', overflow: 'hidden' },
});
