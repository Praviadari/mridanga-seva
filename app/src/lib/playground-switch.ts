// The Rhythm Playground's switch (docs/DECISIONS.md #781): the settings playground_enabled and playground_pilot_group
// (migration 0065; written in the SQL editor only, guard_setting refuses the app). Read here, by the app alone, with
// no migration: the server still serves the pack and saves rounds; only the ways in are hidden.
//   off                     no student sees the Playground (Practice card, Daily Quest, games: they send back to
//                           Practice; tap pad, Which bol? and Echo me are their plain tools again); the Guru keeps the
//                           staff Playground to load content before launch, coordinators see nothing of it
//   on, no pilot group      every student, and both staff roles
//   on, a pilot group id    only the students in that (active) group; both staff roles
// Read at start and when the profile is read again (auth-provider), with the centre's locale, and kept on this device
// for the login that read it, so a start without internet behaves as the last one did; unknown (the first start on
// this device) counts as off. Forgotten at sign-out (lib/device-traces.ts). Hiding is never the guard of data:
// row-level security still decides what each login reads.
// No Playground code here: the student home and the Practice tab import this in the first web download (#650).

import { useSyncExternalStore } from 'react';

import { supabase } from '@/lib/supabase';

import { readLocal, removeLocal, writeLocal } from './local-storage';

/** What the settings say, and whether the signed-in login is in the pilot group. */
export type PlaygroundSwitch = { enabled: boolean; pilotGroup: number | null; inPilot: boolean };

/** Unknown counts as off. */
export const PLAYGROUND_OFF: PlaygroundSwitch = { enabled: false, pilotGroup: null, inPilot: false };

/** Does a student see the Playground? */
export function playgroundOnForStudent(s: PlaygroundSwitch): boolean {
  return s.enabled && (s.pilotGroup === null || s.inPilot);
}

/** Does a staff login see the staff Playground? The Guru always (content before launch); a coordinator while it is on. */
export function playgroundOnForStaff(s: PlaygroundSwitch, role: string | undefined): boolean {
  return role === 'guru' || (role === 'coordinator' && s.enabled);
}

/** Does this login see the Playground: the student rule for students, the staff rule for staff, nothing for others. */
export function playgroundOnFor(s: PlaygroundSwitch, role: string | undefined): boolean {
  return role === 'student' ? playgroundOnForStudent(s) : playgroundOnForStaff(s, role);
}

/** playground_pilot_group as stored (jsonb): a group id, or null for every student. */
export function pilotGroupOf(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

// ---------------------------------------------------------------- kept on this device

const KEY = 'playgroundSwitch';

type Stored = { profileId: string; value: PlaygroundSwitch };

function isSwitch(v: unknown): v is PlaygroundSwitch {
  if (!v || typeof v !== 'object') return false;
  const s = v as Record<string, unknown>;
  return typeof s.enabled === 'boolean' && typeof s.inPilot === 'boolean' && (s.pilotGroup === null || typeof s.pilotGroup === 'number');
}

function readStored(): Stored | null {
  try {
    const stored = JSON.parse(readLocal(KEY) ?? 'null') as Partial<Stored> | null;
    return stored && typeof stored.profileId === 'string' && isSwitch(stored.value) ? (stored as Stored) : null;
  } catch {
    return null;
  }
}

let current: Stored | null = readStored();
const listeners = new Set<() => void>();

function keep(next: Stored | null): void {
  current = next;
  if (next) writeLocal(KEY, JSON.stringify(next));
  else removeLocal(KEY);
  for (const listener of listeners) listener();
}

/** The switch as last read for this login; off when it was never read for it. */
export function playgroundSwitch(profileId: string): PlaygroundSwitch {
  return current && current.profileId === profileId ? current.value : PLAYGROUND_OFF;
}

/** The same, for a screen: it shows again when the switch is read anew. */
export function usePlaygroundSwitch(profileId: string): PlaygroundSwitch {
  const stored = useSyncExternalStore(subscribe, snapshot, snapshot);
  return stored && stored.profileId === profileId ? stored.value : PLAYGROUND_OFF;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot(): Stored | null {
  return current;
}

/** Sign-out: forget it (lib/device-traces.ts). */
export function forgetPlaygroundSwitch(): void {
  keep(null);
}

/**
 * Reads the two settings and, when a pilot group is set, whether this login is in it (its own group_members row of
 * an active group), and keeps the answer. Not awaited by callers: a failure (no internet) keeps the last known one; a
 * database before 0065 has neither setting, which reads as off.
 */
export async function loadPlaygroundSwitch(profileId: string): Promise<void> {
  if (!profileId) return;
  const { data, error } = await supabase.from('settings').select('key, value').in('key', ['playground_enabled', 'playground_pilot_group']);
  if (error || !Array.isArray(data)) return;
  const byKey = new Map((data as { key: string; value: unknown }[]).map((r) => [r.key, r.value]));
  const enabled = byKey.get('playground_enabled') === true;
  const pilotGroup = pilotGroupOf(byKey.get('playground_pilot_group'));
  let inPilot = false;
  if (enabled && pilotGroup !== null) {
    const member = await supabase
      .from('group_members')
      .select('group_id, groups!inner(active)')
      .eq('profile_id', profileId)
      .eq('group_id', pilotGroup)
      .eq('groups.active', true)
      .limit(1);
    if (member.error) return;
    inPilot = Array.isArray(member.data) && member.data.length > 0;
  }
  keep({ profileId, value: { enabled, pilotGroup, inPilot } });
}
