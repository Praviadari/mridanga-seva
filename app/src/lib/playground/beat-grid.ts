// A kīrtan clip's beat grid (docs/RHYTHM_PLAYGROUND.md §7.7, §7.14, §9.1 play_assets.beat_grid; docs/DECISIONS.md
// #762): the annotated sam times, beats per cycle and entry points of a clip, read against the clip player's own
// clock (as the tap pad reads taps against its player). Kīrtan Companion asks "where does the khol start?" — found
// when the tap is within half a beat of an annotated entry (§7.7 scoring); pulse taps are shown as practice only,
// and their timing counts only on a phone tuned with "Tune to this phone" (#470).
//
// Annotation (jsonb): {"sam_ms":[0,8000,...], "beats":8, "bpm":60, "entries_ms":[16000], "tempo_changes":[{"at_ms":..,"bpm":..}]}
// Beats between two sams are spaced evenly; after the last sam they go on at the last cycle's spacing (or `bpm`).

/** A clip's grid, checked. Times in ms from the start of the clip. */
export type KirtanGrid = {
  samMs: number[];
  beats: number;
  bpm: number | null;
  entriesMs: number[];
  tempoChanges: { atMs: number; bpm: number }[];
};

const isMs = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 600000;

/** The grid of a play_assets row, or null when it is missing or not usable (the game then has no kīrtan item). */
export function parseGrid(json: unknown): KirtanGrid | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  const g = json as Record<string, unknown>;
  const sam = Array.isArray(g.sam_ms) ? g.sam_ms : null;
  const beats = g.beats;
  if (!sam || sam.length === 0 || !sam.every(isMs) || typeof beats !== 'number' || !Number.isInteger(beats) || beats < 2 || beats > 32) return null;
  const samMs = [...(sam as number[])].sort((a, b) => a - b);
  for (let i = 1; i < samMs.length; i++) if (samMs[i] - samMs[i - 1] < beats * 100) return null;
  const bpm = typeof g.bpm === 'number' && g.bpm >= 30 && g.bpm <= 240 ? g.bpm : null;
  if (samMs.length < 2 && bpm === null) return null;
  const entries = Array.isArray(g.entries_ms) ? g.entries_ms.filter(isMs) : [];
  const changes = Array.isArray(g.tempo_changes)
    ? g.tempo_changes.flatMap((c) => {
        const o = c as Record<string, unknown> | null;
        return o && isMs(o.at_ms) && typeof o.bpm === 'number' && o.bpm >= 30 && o.bpm <= 240 ? [{ atMs: o.at_ms, bpm: o.bpm }] : [];
      })
    : [];
  return { samMs, beats, bpm, entriesMs: [...entries].sort((a, b) => a - b), tempoChanges: changes };
}

/** The length of one cycle starting at sam number `i`. */
function cycleMs(grid: KirtanGrid, i: number): number {
  const { samMs } = grid;
  if (i + 1 < samMs.length) return samMs[i + 1] - samMs[i];
  if (samMs.length >= 2) return samMs[samMs.length - 1] - samMs[samMs.length - 2];
  return (grid.beats * 60000) / (grid.bpm ?? 60);
}

/** Every beat time from the first sam to `untilMs`. */
export function beatTimes(grid: KirtanGrid, untilMs: number): number[] {
  const out: number[] = [];
  for (let i = 0; ; i++) {
    const start = i < grid.samMs.length ? grid.samMs[i] : grid.samMs[grid.samMs.length - 1] + (i - grid.samMs.length + 1) * cycleMs(grid, grid.samMs.length - 1);
    if (start > untilMs) break;
    const len = cycleMs(grid, Math.min(i, grid.samMs.length - 1));
    for (let b = 0; b < grid.beats; b++) {
      const t = start + (b * len) / grid.beats;
      if (t > untilMs) break;
      out.push(Math.round(t));
    }
    if (i > 2000) break;
  }
  return out;
}

/** Where a time is: the cycle (0-based), the beat (1 = sam) and whether that beat is sam; null before the first sam. */
export function beatAt(grid: KirtanGrid, ms: number): { cycle: number; beat: number; sam: boolean } | null {
  if (ms < grid.samMs[0]) return null;
  const times = beatTimes(grid, ms);
  if (times.length === 0) return null;
  const n = times.length - 1;
  const beat = (n % grid.beats) + 1;
  return { cycle: Math.floor(n / grid.beats), beat, sam: beat === 1 };
}

/** Half the beat at a time: the window for "found" (§7.7: within half a beat). */
export function halfBeatAt(grid: KirtanGrid, ms: number): number {
  let i = 0;
  while (i + 1 < grid.samMs.length && grid.samMs[i + 1] <= ms) i++;
  return cycleMs(grid, i) / grid.beats / 2;
}

/** A tap for "where does the khol start?": the nearest entry, how far off, and found (within half a beat). */
export type EntryResult = { found: boolean; entryMs: number; errorMs: number };

/**
 * Judges an entry tap. `tapMs` is the player's position when tapped; `offsetMs` the phone's measured delay
 * (play-bests tapOffset, 0 when not tuned) — the sound reaches the ear that much after the player says.
 */
export function entryResult(grid: KirtanGrid, tapMs: number, offsetMs = 0): EntryResult | null {
  if (grid.entriesMs.length === 0) return null;
  const heard = tapMs - offsetMs;
  let best = grid.entriesMs[0];
  for (const e of grid.entriesMs) if (Math.abs(e - heard) < Math.abs(best - heard)) best = e;
  const errorMs = Math.round(heard - best);
  return { found: Math.abs(errorMs) <= halfBeatAt(grid, best), entryMs: best, errorMs };
}

/** Pulse taps against the grid's beats: each tap's error to its nearest beat, then the median and the spread. */
export type PulseStats = { taps: number; medianMs: number; spreadMs: number };

export function pulseStats(grid: KirtanGrid, tapsMs: readonly number[], offsetMs = 0): PulseStats | null {
  if (tapsMs.length < 3) return null;
  const last = Math.max(...tapsMs) + 2000;
  const beats = beatTimes(grid, last);
  if (beats.length === 0) return null;
  const errors = tapsMs.map((tap) => {
    const heard = tap - offsetMs;
    let best = beats[0];
    for (const b of beats) if (Math.abs(b - heard) < Math.abs(best - heard)) best = b;
    return heard - best;
  });
  const median = medianOf(errors);
  // Spread: the median distance from the median (steady taps that are all a little late are steady).
  return { taps: errors.length, medianMs: Math.round(median), spreadMs: Math.round(medianOf(errors.map((e) => Math.abs(e - median)))) };
}

function medianOf(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Where to start replaying an entry so it is heard in context: one cycle before it (never before the clip). */
export function replayFrom(grid: KirtanGrid, entryMs: number): number {
  let i = 0;
  while (i + 1 < grid.samMs.length && grid.samMs[i + 1] <= entryMs) i++;
  return Math.max(0, entryMs - cycleMs(grid, Math.max(0, i - 1)));
}
