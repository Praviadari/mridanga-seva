// Face spike (P3-0, never merged): what the test app keeps, all on the test phone only — no server.
// - Templates (one per volunteer code, e.g. V03): expo-secure-store, i.e. encrypted with a key in the
//   Android Keystore. No pictures are ever kept; a template is 128 numbers.
// - Results: scores and timings per attempt in the app's own folder (spike-results.json). Volunteer
//   names never enter the app — only codes; the paper consent forms link code and name.
// deleteEverything() removes all of it (SPIKE_RESULT.md "Deleting the volunteers' data").

import { File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';

import { base64ToFloats, floatsToBase64, meanTemplate } from './face-math';

const INDEX_KEY = 'spike.tpl.index';
const tplKey = (code: string) => `spike.tpl.${code}`;
const RESULTS_FILE = 'spike-results.json';

export type Template = { code: string; model: string; createdAt: string; mean: Float32Array; samples: Float32Array[] };

export function validCode(code: string): boolean {
  return /^V\d{2}$/.test(code);
}

export async function listCodes(): Promise<string[]> {
  const raw = await SecureStore.getItemAsync(INDEX_KEY);
  return raw ? (JSON.parse(raw) as string[]) : [];
}

export async function saveTemplate(code: string, model: string, samples: Float32Array[]): Promise<Template> {
  const tpl: Template = { code, model, createdAt: new Date().toISOString(), mean: meanTemplate(samples), samples };
  await SecureStore.setItemAsync(
    tplKey(code),
    JSON.stringify({ code, model, createdAt: tpl.createdAt, mean: floatsToBase64(tpl.mean), samples: samples.map(floatsToBase64) }),
  );
  const codes = await listCodes();
  if (!codes.includes(code)) await SecureStore.setItemAsync(INDEX_KEY, JSON.stringify([...codes, code].sort()));
  return tpl;
}

export async function loadTemplates(): Promise<Template[]> {
  const out: Template[] = [];
  for (const code of await listCodes()) {
    const raw = await SecureStore.getItemAsync(tplKey(code));
    if (!raw) continue;
    const j = JSON.parse(raw);
    out.push({ code, model: j.model, createdAt: j.createdAt, mean: base64ToFloats(j.mean), samples: (j.samples as string[]).map(base64ToFloats) });
  }
  return out;
}

export async function removeTemplate(code: string): Promise<void> {
  await SecureStore.deleteItemAsync(tplKey(code));
  await SecureStore.setItemAsync(INDEX_KEY, JSON.stringify((await listCodes()).filter((c) => c !== code)));
}

/** One attempt, as logged. Scores only. */
export type ResultRow = {
  at: string;
  kind: 'enrol' | 'check' | 'attack';
  code: string; // the volunteer claimed (check/attack) or enrolled
  attack?: 'printed photo' | 'screen photo' | 'screen video' | 'video call relay' | 'mask or cut-out' | 'other';
  challenge: 'passed' | 'failed' | 'skipped';
  challengeMs?: number;
  failReason?: string;
  realScore?: number;
  fasA?: number;
  fasB?: number;
  ownScore?: number; // cosine with the claimed code's template
  others?: Record<string, number>; // cosine with every other template (impostor scores)
  accepted?: boolean; // at the thresholds in force
  matchThreshold?: number;
  liveThreshold?: number;
  path?: string;
  capture?: string; // frame | photo
  imageSize?: string;
  frameToResultMs?: number;
  timings?: Record<string, number>;
  rssMb?: number;
  note?: string;
};

function resultsFile() {
  return new File(Paths.document, RESULTS_FILE);
}

export function loadResults(): ResultRow[] {
  const f = resultsFile();
  if (!f.exists) return [];
  try {
    return JSON.parse(f.textSync()) as ResultRow[];
  } catch {
    return [];
  }
}

export function addResult(row: ResultRow): ResultRow[] {
  const rows = [...loadResults(), row];
  const f = resultsFile();
  if (!f.exists) f.create();
  f.write(JSON.stringify(rows));
  return rows;
}

/** CSV of all rows (one column per field; others as "V02:0.12 V05:0.08"). */
export function resultsCsv(rows: ResultRow[]): string {
  const cols: (keyof ResultRow)[] = [
    'at', 'kind', 'code', 'attack', 'challenge', 'challengeMs', 'failReason', 'realScore', 'fasA', 'fasB', 'ownScore', 'others',
    'accepted', 'matchThreshold', 'liveThreshold', 'path', 'capture', 'imageSize', 'frameToResultMs', 'timings', 'rssMb', 'note',
  ];
  const cell = (v: unknown) => {
    if (v === undefined || v === null) return '';
    let s: string;
    if (typeof v === 'object') s = Object.entries(v as Record<string, number>).map(([k, n]) => `${k}:${typeof n === 'number' ? +n.toFixed(4) : n}`).join(' ');
    else if (typeof v === 'number') s = String(+v.toFixed(4));
    else s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n');
}

/** Removes every template, the results file and the SQLCipher test database. Returns what was removed. */
export async function deleteEverything(): Promise<string[]> {
  const gone: string[] = [];
  for (const code of await listCodes()) {
    await SecureStore.deleteItemAsync(tplKey(code));
    gone.push(`template ${code}`);
  }
  await SecureStore.deleteItemAsync(INDEX_KEY);
  await SecureStore.deleteItemAsync('spike.cipher.key');
  await SecureStore.deleteItemAsync('spike.bio.test');
  const f = resultsFile();
  if (f.exists) {
    f.delete();
    gone.push('results file');
  }
  for (const name of ['spike-cipher.db', 'spike-cipher.db-wal', 'spike-cipher.db-shm']) {
    const db = new File(Paths.document, 'SQLite', name);
    if (db.exists) {
      db.delete();
      gone.push(name);
    }
  }
  return gone;
}
