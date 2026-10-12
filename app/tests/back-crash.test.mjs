// Unit tests for the Back crash of 12-10-2026 (docs/DECISIONS.md #260-#262): leaving a screen with the
// recorder (S5 Practice tools "Record myself", S7, C14, the sloka editor) showed "Something went wrong" on
// Android, because a cleanup read the expo-audio recorder after useAudioRecorder had released it.
// Run from app/: npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';

import './stubs/register.mjs';

const { stopRecorderOnLeave } = await import('../src/components/recorder-leave.ts');

const src = new URL('../src/', import.meta.url);

/** Every .ts / .tsx file under src/, as [path relative to src, text]. */
function sourceFiles(dir = src, prefix = '') {
  return readdirSync(dir).flatMap((name) => {
    const url = new URL(name, dir);
    if (statSync(url).isDirectory()) return sourceFiles(new URL(`${name}/`, dir), `${prefix}${name}/`);
    return /\.tsx?$/.test(name) ? [[`${prefix}${name}`, readFileSync(url, 'utf8')]] : [];
  });
}

/** The text of the call that opens at `open` (the index of its '('), brackets matched. */
function callText(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1;
    else if (text[i] === ')' && --depth === 0) return text.slice(open, i + 1);
  }
  return text.slice(open);
}

test('a released recorder (Android throws on any read) is left alone without an error', () => {
  const released = {
    get isRecording() {
      throw new Error('The 1st argument cannot be cast to type class expo.modules.audio.AudioRecorder (received class java.lang.Integer)');
    },
    stop: () => assert.fail('a released recorder is not stopped'),
  };
  assert.doesNotThrow(() => stopRecorderOnLeave(released));
});

test('a recorder still recording is stopped once; one that is not is left alone', () => {
  let stops = 0;
  stopRecorderOnLeave({ isRecording: true, stop: async () => void (stops += 1) });
  assert.equal(stops, 1);
  stopRecorderOnLeave({ isRecording: false, stop: async () => void (stops += 1) });
  assert.equal(stops, 1);
});

test('a stop that fails while the screen goes is ignored, not an unhandled rejection', async () => {
  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  try {
    stopRecorderOnLeave({ isRecording: true, stop: () => Promise.reject(new Error('already stopped')) });
    stopRecorderOnLeave({
      isRecording: true,
      stop: () => {
        throw new Error('released while stopping');
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
  assert.deepEqual(unhandled, []);
});

test('the recorder panel stops the recorder in a layout-effect cleanup, before expo-audio releases it', () => {
  const panel = readFileSync(new URL('components/audio-recorder.tsx', src), 'utf8');
  assert.match(panel, /useLayoutEffect\(\(\) => \(\) => stopRecorderOnLeave\(recorder\), \[recorder\]\)/);
});

test('no useEffect cleanup touches an expo-audio object made by its own hook (released first on unmount)', () => {
  const found = [];
  for (const [file, text] of sourceFiles()) {
    const names = [...text.matchAll(/const (\w+) = use(?:AudioRecorder|AudioPlayer|AudioPlaylist|VideoPlayer)\(/g)].map((m) => m[1]);
    if (names.length === 0) continue;
    for (const call of text.matchAll(/useEffect\(/g)) {
      const effect = callText(text, call.index + 'useEffect'.length);
      // The cleanup: what the effect returns as a function ("() => () => ..." or "return () => ...").
      const cleanup = effect.match(/(?:=>\s*\(\)\s*=>|return\s*\(\)\s*=>)([\s\S]*)/)?.[1] ?? '';
      for (const name of names) if (new RegExp(`\\b${name}\\.`).test(cleanup)) found.push(`${file}: ${name}`);
    }
  }
  assert.deepEqual(found, [], 'use useLayoutEffect for the cleanup (components/recorder-leave.ts explains why)');
});
