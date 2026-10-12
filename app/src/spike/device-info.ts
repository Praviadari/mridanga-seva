// Face spike (P3-0, never merged): the phone's model and the app's memory use, for the result table.
// Memory comes from Linux's /proc/self/status (VmRSS = now, VmHWM = peak since the app started); if Android
// does not let the app read it, the values are simply missing.

import { File } from 'expo-file-system';
import { Platform } from 'react-native';

function procStatus(): string | null {
  try {
    return new File('file:///proc/self/status').textSync();
  } catch {
    return null;
  }
}

function kbField(text: string, name: string): number | null {
  const m = new RegExp(`^${name}:\\s+(\\d+)\\s+kB`, 'm').exec(text);
  return m ? Math.round(Number(m[1]) / 1024) : null;
}

/** Resident memory now, in MB, or null. */
export function readRssMb(): number | null {
  const s = procStatus();
  return s ? kbField(s, 'VmRSS') : null;
}

/** Peak resident memory since start, in MB, or null. */
export function readPeakMb(): number | null {
  const s = procStatus();
  return s ? kbField(s, 'VmHWM') : null;
}

export function deviceLine(): string {
  const c = Platform.constants as unknown as Record<string, unknown>;
  return [c.Brand, c.Model, `Android ${c.Release ?? Platform.Version}`, `API ${Platform.Version}`].filter(Boolean).join(' · ');
}
