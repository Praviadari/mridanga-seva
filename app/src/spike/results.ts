// Face spike (P3-0, never merged): the numbers SPIKE_RESULT.md needs, computed from the logged rows.

import { ratesAt, zeroFalseAcceptPoint } from './face-math';
import type { ResultRow } from './store';

export const THRESHOLDS = [0.3, 0.363, 0.4, 0.45, 0.5, 0.55, 0.6];

function pct(sorted: number[], p: number) {
  if (sorted.length === 0) return NaN;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

function stats(values: number[]) {
  const s = [...values].sort((a, b) => a - b);
  return { n: s.length, median: pct(s, 0.5), p90: pct(s, 0.9), max: s.length ? s[s.length - 1] : NaN, min: s.length ? s[0] : NaN };
}

const f = (v: number, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : '–');

export function summary(rows: ResultRow[], liveThreshold: number): string[] {
  const out: string[] = [];
  const enrol = rows.filter((r) => r.kind === 'enrol' && r.realScore !== undefined);
  const checks = rows.filter((r) => r.kind === 'check');
  const scored = checks.filter((r) => r.ownScore !== undefined);
  const genuine = scored.map((r) => r.ownScore!);
  const impostor = checks.flatMap((r) => Object.values(r.others ?? {}));
  out.push(`Enrolments ${enrol.length} · check attempts ${checks.length} (${scored.length} with a picture) · attacks ${rows.filter((r) => r.kind === 'attack').length}`);
  out.push(`Genuine scores ${genuine.length}: ${JSON.stringify(stats(genuine), (_, v) => (typeof v === 'number' ? +v.toFixed(3) : v))}`);
  out.push(`Impostor scores ${impostor.length}: ${JSON.stringify(stats(impostor), (_, v) => (typeof v === 'number' ? +v.toFixed(3) : v))}`);
  out.push('Match only (cosine) — threshold: false accept / false reject');
  for (const t of THRESHOLDS) {
    const r = ratesAt(t, genuine, impostor);
    out.push(`  ${t.toFixed(3)}: FAR ${f(r.far, 4)} (${r.fa}/${impostor.length}) · FRR ${f(r.frr)} (${r.fr}/${genuine.length})`);
  }
  const z = zeroFalseAcceptPoint(genuine, impostor);
  out.push(`  No false accept from ${f(z.threshold)} up: FRR there ${f(z.frr)}`);
  const accepted = checks.filter((r) => r.accepted).length;
  out.push(`Whole check (challenge + real-face + match, thresholds at the time): accepted ${accepted}/${checks.length} genuine attempts`);
  const challengeFails = checks.filter((r) => r.challenge === 'failed').length;
  out.push(`  of which challenge failed ${challengeFails}; real-face below ${liveThreshold}: ${scored.filter((r) => (r.realScore ?? 0) < liveThreshold).length}`);
  const live = scored.map((r) => r.realScore!);
  out.push(`Real-face score on genuine attempts: ${JSON.stringify(stats(live), (_, v) => (typeof v === 'number' ? +v.toFixed(3) : v))}`);
  const kinds = ['printed photo', 'screen photo', 'screen video', 'other'] as const;
  for (const k of kinds) {
    const a = rows.filter((r) => r.kind === 'attack' && r.attack === k);
    if (a.length === 0) continue;
    const passCh = a.filter((r) => r.challenge === 'passed').length;
    const passLive = a.filter((r) => (r.realScore ?? 0) >= liveThreshold).length;
    const acc = a.filter((r) => r.accepted).length;
    const matchHigh = a.filter((r) => (r.ownScore ?? -1) >= 0.45).length;
    out.push(`Attack "${k}" ×${a.length}: challenge passed ${passCh}, real-face ≥ ${liveThreshold} ${passLive}, match ≥ 0.45 ${matchHigh}, ACCEPTED ${acc}`);
    out.push(`  real-face scores ${a.map((r) => f(r.realScore ?? NaN, 2)).join(' ')}`);
  }
  for (const path of ['fast', 'exact']) {
    const t = rows.filter((r) => r.path === path && r.frameToResultMs !== undefined).map((r) => r.frameToResultMs!);
    if (t.length) out.push(`Frame → result (${path}) ms: ${JSON.stringify(stats(t))}`);
  }
  const steps = ['detectLive', 'convert', 'saveJpg', 'detectStill', 'place', 'pixels', 'crops', 'sface', 'fas'];
  const parts = steps
    .map((s) => {
      const v = rows.map((r) => r.timings?.[s]).filter((x): x is number => typeof x === 'number');
      return v.length ? `${s} ${stats(v).median}` : null;
    })
    .filter(Boolean);
  if (parts.length) out.push(`Median step ms: ${parts.join(' · ')}`);
  const ch = rows.map((r) => r.challengeMs).filter((x): x is number => typeof x === 'number');
  if (ch.length) out.push(`Challenge time ms: ${JSON.stringify(stats(ch))}`);
  const rss = rows.map((r) => r.rssMb).filter((x): x is number => typeof x === 'number');
  if (rss.length) out.push(`Memory during scans (MB): max ${Math.max(...rss)}`);
  return out;
}
