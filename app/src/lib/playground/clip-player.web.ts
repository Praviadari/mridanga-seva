// The Playground's clip player in the browser (docs/DECISIONS.md #762): the Web Audio API. A file link is fetched
// and decoded once; a generated sound is copied into a buffer once; both kept for the page's life (keyed). The
// position is read from the audio clock (AudioContext.currentTime) minus the output delay the browser reports, so
// it is when the sound is heard. One sound at a time; never starts by itself. The phone version is clip-player.ts.

import { TONE_RATE } from './tones';

export type ClipSource = { uri: string } | { key: string; render: () => Float32Array };

export type ClipPlayer = {
  play: (source: ClipSource, fromMs?: number, rate?: number) => Promise<boolean>;
  stop: () => void;
  positionMs: () => number;
  isPlaying: () => boolean;
  onEnd: (fn: (() => void) | null) => void;
  dispose: () => void;
};

type WithWebkit = typeof globalThis & { webkitAudioContext?: typeof AudioContext };

let ctx: AudioContext | null = null;
let active: ClipPlayer | null = null;
const buffers = new Map<string, AudioBuffer>();

function context(): AudioContext | null {
  if (ctx) return ctx;
  const g = globalThis as WithWebkit;
  const Context = g.AudioContext ?? g.webkitAudioContext;
  ctx = Context ? new Context({ latencyHint: 'interactive' }) : null;
  return ctx;
}

async function bufferOf(c: AudioContext, source: ClipSource): Promise<AudioBuffer> {
  const key = 'uri' in source ? `uri:${source.uri.split('?')[0]}` : `gen:${source.key}`;
  const kept = buffers.get(key);
  if (kept) return kept;
  let buffer: AudioBuffer;
  if ('uri' in source) {
    const response = await fetch(source.uri);
    buffer = await c.decodeAudioData(await response.arrayBuffer());
  } else {
    const samples = source.render();
    buffer = c.createBuffer(1, samples.length, TONE_RATE);
    buffer.getChannelData(0).set(samples);
  }
  buffers.set(key, buffer);
  return buffer;
}

export function createClipPlayer(): ClipPlayer {
  let node: AudioBufferSourceNode | null = null;
  let startedAt = 0;
  let from = 0;
  let speed = 1;
  let ended: (() => void) | null = null;

  const self: ClipPlayer = {
    async play(source, fromMs = 0, rate = 1) {
      if (active && active !== self) active.stop();
      active = self;
      self.stop();
      const c = context();
      if (!c) return false;
      try {
        if (c.state === 'suspended') await c.resume();
        const buffer = await bufferOf(c, source);
        const n = c.createBufferSource();
        n.buffer = buffer;
        n.playbackRate.value = rate;
        n.connect(c.destination);
        n.onended = () => {
          if (node !== n) return;
          node = null;
          ended?.();
        };
        from = fromMs;
        speed = rate;
        startedAt = c.currentTime + 0.05;
        n.start(startedAt, fromMs / 1000);
        node = n;
        return true;
      } catch {
        return false;
      }
    },
    stop() {
      const n = node;
      node = null;
      if (n) {
        n.onended = null;
        try {
          n.stop();
        } catch {
          // already stopped
        }
      }
    },
    positionMs() {
      const c = ctx;
      if (!node || !c) return 0;
      const heard = c.currentTime - (c.outputLatency || c.baseLatency || 0);
      return Math.max(0, Math.round(from + (heard - startedAt) * 1000 * speed));
    },
    isPlaying: () => node !== null,
    onEnd(fn) {
      ended = fn;
    },
    dispose() {
      self.stop();
      if (active === self) active = null;
    },
  };
  return self;
}

export function stopAllClips(): void {
  active?.stop();
}
