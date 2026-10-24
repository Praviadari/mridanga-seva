// The tap pad's own sound in the browser (docs/DECISIONS.md #470): each tap starts its stroke at once with the Web
// Audio API, from the same synthesised or recorded samples as the player (lib/practice-sounds.ts). pad-sound.ts is the
// phone version.

import type { SoundId } from './bols';
import type { PadSound } from './pad-sound';
import { soundSamples, soundsVersion } from './practice-sounds';

export type { PadSound };

class WebPadSound implements PadSound {
  private ctx: AudioContext | null = null;
  private buffers = new Map<SoundId, AudioBuffer>();
  private version = soundsVersion();

  async prepare(ids: readonly SoundId[]): Promise<void> {
    try {
      if (!this.ctx) {
        const Context = globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Context) return;
        this.ctx = new Context({ latencyHint: 'interactive' });
      }
      await this.ctx.resume();
    } catch {
      return;
    }
    const ctx = this.ctx;
    if (this.version !== soundsVersion()) {
      this.buffers.clear();
      this.version = soundsVersion();
    }
    for (const id of ids) {
      if (this.buffers.has(id)) continue;
      const samples = soundSamples(id, ctx.sampleRate);
      const buffer = ctx.createBuffer(1, Math.max(1, samples.length), ctx.sampleRate);
      buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
      this.buffers.set(id, buffer);
    }
  }

  play(id: SoundId): void {
    const ctx = this.ctx;
    const buffer = this.buffers.get(id);
    if (!ctx || !buffer) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start();
  }

  dispose(): void {
    void this.ctx?.close();
    this.ctx = null;
    this.buffers.clear();
  }
}

/** A pad sound for one screen. Call dispose() when the screen goes. */
export function createPadSound(): PadSound {
  return new WebPadSound();
}
