// The practice player in the browser (web test site, iPhone home-screen app): the Web Audio API
// with a look-ahead scheduler ("a tale of two clocks"). A 25 ms JavaScript timer only decides what
// to schedule; every sound is started on the audio clock (AudioContext.currentTime) at its exact
// time, computed from one anchor: time = anchorTime + (beat − anchorBeat) × 60 / bpm. A late or
// early timer therefore never shifts a sound, and nothing adds up over minutes (no drift). A tempo
// change sets a new anchor at that moment and takes back the sounds scheduled after it.
// The phone version (practice-audio.ts) plays a rendered loop with expo-audio instead.
//
// In development builds the player is on globalThis.__practicePlayer with its schedule log, so the
// timing can be checked from the browser console (docs/ARCHITECTURE.md "Practice tools").

import type { SoundId } from './bols';
import type { Pattern } from './practice-pattern';
import type { PlayerPosition, PracticePlayer } from './practice-player';
import { soundSamples } from './practice-sounds';

export type { PlayerPosition, PracticePlayer } from './practice-player';

/** How far ahead sounds are scheduled, seconds (longer while the tab is hidden: timers slow down). */
const LOOKAHEAD = 0.15;
const LOOKAHEAD_HIDDEN = 1.5;
/** How often the scheduler looks, ms. */
const TICK_MS = 25;
/** Delay before the first beat, seconds, so the first sound is not late. */
const START_DELAY = 0.08;

type Scheduled = { source: AudioBufferSourceNode; time: number };

/** One scheduled sound, for the timing check: absolute beat, planned time, and how early it was scheduled. */
export type ScheduleEntry = { beat: number; time: number; lead: number };

class WebPracticePlayer implements PracticePlayer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<SoundId, AudioBuffer>();
  private pattern: Pattern | null = null;
  private bpm = 80;
  private anchorTime = 0;
  private anchorBeat = 0;
  private nextIndex = 0;
  private nextCycle = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private scheduled: Scheduled[] = [];
  /** Timing check: the last 4000 scheduled sounds, sounds scheduled late, the smallest lead. */
  readonly log: ScheduleEntry[] = [];
  late = 0;
  minLead = Infinity;

  get audioContext(): AudioContext | null {
    return this.ctx;
  }

  get output(): GainNode | null {
    return this.master;
  }

  async start(pattern: Pattern, bpm: number): Promise<boolean> {
    this.stop();
    try {
      if (!this.ctx) {
        const Context = globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Context) return false;
        this.ctx = new Context({ latencyHint: 'interactive' });
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.9;
        this.master.connect(this.ctx.destination);
      }
      await this.ctx.resume();
    } catch {
      return false;
    }
    this.pattern = pattern;
    this.bpm = bpm;
    this.prepare(pattern);
    this.anchorTime = this.ctx.currentTime + START_DELAY;
    this.anchorBeat = 0;
    this.nextIndex = 0;
    this.nextCycle = 0;
    this.log.length = 0;
    this.late = 0;
    this.minLead = Infinity;
    this.tick();
    this.timer = setInterval(() => this.tick(), TICK_MS);
    return true;
  }

  setTempo(bpm: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.pattern || this.timer === null || bpm === this.bpm) {
      this.bpm = bpm;
      return;
    }
    // From a moment just ahead: the beat there at the old tempo becomes the new anchor; sounds
    // planned after it are taken back and planned again at the new tempo.
    const cut = Math.max(ctx.currentTime + 0.005, this.anchorTime);
    const beatAtCut = this.beatAt(cut);
    this.scheduled = this.scheduled.filter((s) => {
      if (s.time > cut) {
        try {
          s.source.stop();
        } catch {
          // already ended
        }
        return false;
      }
      return true;
    });
    this.anchorTime = cut;
    this.anchorBeat = beatAtCut;
    this.bpm = bpm;
    this.seek(beatAtCut);
    this.tick();
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    for (const s of this.scheduled) {
      try {
        s.source.stop();
      } catch {
        // already ended
      }
    }
    this.scheduled = [];
    this.pattern = null;
  }

  position(): PlayerPosition | null {
    const ctx = this.ctx;
    if (!ctx || !this.pattern || this.timer === null) return null;
    // What is heard now: the audio clock minus the time the sound needs to reach the speaker.
    const heard = ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0);
    const beat = this.beatAt(heard);
    if (beat < 0) return null;
    const cycle = Math.floor(beat / this.pattern.beats);
    return { beat: beat - cycle * this.pattern.beats, cycle };
  }

  dispose(): void {
    this.stop();
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
    this.buffers.clear();
  }

  /** Absolute beat (cycles × beats + position) at an audio-clock time. */
  private beatAt(time: number): number {
    return this.anchorBeat + ((time - this.anchorTime) * this.bpm) / 60;
  }

  private timeOf(beat: number): number {
    return this.anchorTime + ((beat - this.anchorBeat) * 60) / this.bpm;
  }

  /** Points the scheduler at the first sound after the absolute beat `beat`. */
  private seek(beat: number): void {
    const pattern = this.pattern;
    if (!pattern) return;
    const cycle = Math.floor(beat / pattern.beats);
    const within = beat - cycle * pattern.beats;
    const index = pattern.events.findIndex((e) => e.at > within + 1e-9);
    if (index === -1) {
      this.nextCycle = cycle + 1;
      this.nextIndex = 0;
    } else {
      this.nextCycle = cycle;
      this.nextIndex = index;
    }
  }

  private prepare(pattern: Pattern): void {
    const ctx = this.ctx;
    if (!ctx) return;
    for (const event of pattern.events) {
      if (this.buffers.has(event.sound)) continue;
      const samples = soundSamples(event.sound, ctx.sampleRate);
      const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
      buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
      this.buffers.set(event.sound, buffer);
    }
  }

  private tick(): void {
    const ctx = this.ctx;
    const pattern = this.pattern;
    if (!ctx || !this.master || !pattern || pattern.events.length === 0) return;
    const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    const until = ctx.currentTime + (hidden ? LOOKAHEAD_HIDDEN : LOOKAHEAD);
    for (;;) {
      const event = pattern.events[this.nextIndex];
      const beat = this.nextCycle * pattern.beats + event.at;
      const time = this.timeOf(beat);
      if (time > until) break;
      const buffer = this.buffers.get(event.sound);
      if (buffer) {
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(this.master);
        const lead = time - ctx.currentTime;
        source.start(Math.max(time, ctx.currentTime));
        const entry: Scheduled = { source, time };
        this.scheduled.push(entry);
        source.onended = () => {
          this.scheduled = this.scheduled.filter((s) => s !== entry);
        };
        if (lead < 0) this.late++;
        this.minLead = Math.min(this.minLead, lead);
        this.log.push({ beat, time, lead });
        if (this.log.length > 4000) this.log.shift();
      }
      this.nextIndex++;
      if (this.nextIndex >= pattern.events.length) {
        this.nextIndex = 0;
        this.nextCycle++;
      }
    }
  }
}

/** A new player for one screen. Call dispose() when the screen goes. */
export function createPracticePlayer(): PracticePlayer {
  const player = new WebPracticePlayer();
  if (__DEV__) (globalThis as { __practicePlayer?: unknown }).__practicePlayer = player;
  return player;
}
