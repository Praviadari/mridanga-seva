// The approximate pitch line in the browser (web test site, iPhone home-screen app; docs/RHYTHM_PLAYGROUND.md §7.5,
// §11.2, §13.2; docs/DECISIONS.md #764): the microphone through Web Audio, one frame every ~90 ms, the pitch
// estimated on the device (lib/pitch-estimate.ts). Nothing is recorded, kept or sent. Research only, behind a TEST
// switch: offered only by a build that talks to the TEST project, and only after the student taps it on; the
// microphone stops when the screen stops it (or leaves). The phone app has no live samples (expo-audio), so
// lib/pitch.ts says "not available" there — docs/PLAYGROUND_MIC_SPIKE.md has the Android routes.

import { estimatePitch, frameLevel, type PitchEstimate } from './pitch-estimate';

/**
 * Only the TEST web site (its deployments and the walk alias) and a local dev server offer the pitch line. Decided by
 * the page's address, not the TEST project's ref: the LIVE build must not contain that ref (scripts/export-web.mjs
 * refuses it, 30-10-2026).
 */
function onTestSite(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host === 'mridanga-seva-test.pages.dev' || host.endsWith('.mridanga-seva-test.pages.dev') || host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

/** One reading: the pitch (null when nothing clear) and the level (0-1), for "too quiet" and "noisy" hints. */
export type PitchFrame = { estimate: PitchEstimate | null; level: number };

/** A running pitch line: stop() releases the microphone. */
export type PitchLine = { stop: () => void };

type WithWebkit = typeof globalThis & { webkitAudioContext?: typeof AudioContext };

/** True when this build may offer the pitch line (TEST switch) and the browser can give live microphone samples. */
export function pitchLineAvailable(): boolean {
  if (!onTestSite()) return false;
  const g = globalThis as WithWebkit;
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) && Boolean(g.AudioContext ?? g.webkitAudioContext);
}

/**
 * Starts listening (the browser asks for the microphone now — only ever after the student's tap). Null when it
 * was refused or is not available.
 */
export async function startPitchLine(onFrame: (frame: PitchFrame) => void): Promise<PitchLine | null> {
  if (!pitchLineAvailable()) return null;
  let stream: MediaStream;
  try {
    // The voice as it is: the browser's clean-up would bend the pitch and the level.
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  } catch {
    return null;
  }
  const g = globalThis as WithWebkit;
  const Context = g.AudioContext ?? g.webkitAudioContext;
  if (!Context) {
    stream.getTracks().forEach((track) => track.stop());
    return null;
  }
  const ctx = new Context();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);
  const frame = new Float32Array(analyser.fftSize);
  const timer = setInterval(() => {
    analyser.getFloatTimeDomainData(frame);
    onFrame({ estimate: estimatePitch(frame, ctx.sampleRate), level: frameLevel(frame) });
  }, 90);
  let stopped = false;
  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      source.disconnect();
      stream.getTracks().forEach((track) => track.stop());
      void ctx.close();
    },
  };
}
