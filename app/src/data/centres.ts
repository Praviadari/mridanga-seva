// G9 Centres and attendance area, the Guru only: the places where the class meets (Abids today),
// each with an address, a GPS point and a radius, and its open window. The database checks every
// value (guard_centre_details, migration 0015; the window: centres_guard, 0014) and logs each change.
// A centre is switched off, never deleted: visits and people point to it. The phone does not check
// the area yet: that needs expo-location, a native package, in the next planned APK
// (docs/DECISIONS.md #51).

import type { ParseKeys } from 'i18next';

import { parseTimeOfDay } from '@/lib/dates';
import { readPoint } from '@/lib/map-link';
import { supabase } from '@/lib/supabase';

import { isNetworkError } from './errors';

/** One centre as the list shows it. */
export type Centre = {
  id: number;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  radiusM: number;
  opensAt: string;
  closesAt: string;
  active: boolean;
  /** Students (not Left) whose home centre it is. */
  students: number;
};

/** The edit form, as typed. */
export type CentreForm = {
  name: string;
  address: string;
  /** "17.3850, 78.4867" or a Google Maps link; empty = no point yet. */
  location: string;
  radius: string;
  opensAt: string;
  closesAt: string;
};

/** The radius the database accepts, in metres. */
export const RADIUS = { min: 25, max: 2000, default: 150 } as const;

type Row = {
  id: number;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  radius_m: number;
  opens_at: string;
  closes_at: string;
  active: boolean;
};

const COLUMNS = 'id, name, address, lat, lng, radius_m, opens_at, closes_at, active';

/** Every centre, those in use first, with how many students call it home. Null = could not load. */
export async function fetchCentres(): Promise<Centre[] | null> {
  const [centres, students] = await Promise.all([
    supabase.from('centres').select(COLUMNS).order('active', { ascending: false }).order('name'),
    supabase.from('students').select('home_centre_id').neq('status', 'left'),
  ]);
  if (centres.error || students.error) return null;
  const counts = new Map<number, number>();
  for (const s of students.data as { home_centre_id: number }[]) counts.set(s.home_centre_id, (counts.get(s.home_centre_id) ?? 0) + 1);
  return (centres.data as Row[]).map((r) => ({
    id: r.id,
    name: r.name,
    address: r.address,
    lat: r.lat,
    lng: r.lng,
    radiusM: r.radius_m,
    opensAt: r.opens_at.slice(0, 5),
    closesAt: r.closes_at.slice(0, 5),
    active: r.active,
    students: counts.get(r.id) ?? 0,
  }));
}

/** The form for a centre, or an empty one for a new centre. */
export function formOf(centre: Centre | null): CentreForm {
  return centre
    ? {
        name: centre.name,
        address: centre.address ?? '',
        location: centre.lat !== null && centre.lng !== null ? `${centre.lat}, ${centre.lng}` : '',
        radius: String(centre.radiusM),
        opensAt: centre.opensAt,
        closesAt: centre.closesAt,
      }
    : { name: '', address: '', location: '', radius: String(RADIUS.default), opensAt: '14:30', closesAt: '20:00' };
}

/** Problems with fields of the form, as message keys. */
export type CentreErrors = Partial<Record<keyof CentreForm, ParseKeys>>;

/** Checks the form as the database will. */
export function checkCentre(form: CentreForm): CentreErrors {
  const errors: CentreErrors = {};
  const name = form.name.trim();
  if (!name) errors.name = 'centres.errors.nameRequired';
  else if (name.length > 60) errors.name = 'centres.errors.nameTooLong';
  if (form.address.trim().length > 300) errors.address = 'centres.errors.addressTooLong';
  if (form.location.trim()) {
    const p = readPoint(form.location);
    if (p === 'short_link') errors.location = 'centres.errors.shortLink';
    else if (!p) errors.location = 'centres.errors.location';
  }
  const radius = Number(form.radius.trim());
  if (!/^\d+$/.test(form.radius.trim()) || radius < RADIUS.min || radius > RADIUS.max) errors.radius = 'centres.errors.radius';
  const opens = parseTimeOfDay(form.opensAt);
  const closes = parseTimeOfDay(form.closesAt);
  if (!opens) errors.opensAt = 'settings.errors.time';
  if (!closes) errors.closesAt = 'settings.errors.time';
  if (opens && closes && opens >= closes) errors.closesAt = 'settings.errors.window';
  return errors;
}

/** Saves a new centre (id null) or changes one; checkCentre first. Returns the centre's id. */
export async function saveCentre(id: number | null, form: CentreForm): Promise<{ id?: number; errorKey?: ParseKeys }> {
  const p = form.location.trim() ? readPoint(form.location) : null;
  const point = p && p !== 'short_link' ? p : null;
  const values = {
    name: form.name.trim(),
    address: form.address.trim() || null,
    lat: point?.lat ?? null,
    lng: point?.lng ?? null,
    radius_m: Number(form.radius.trim()),
    opens_at: parseTimeOfDay(form.opensAt),
    closes_at: parseTimeOfDay(form.closesAt),
  };
  const query = id === null ? supabase.from('centres').insert(values) : supabase.from('centres').update(values).eq('id', id);
  const { data, error } = await query.select('id').single();
  if (error) return { errorKey: errorKeyOf(error.message) };
  return { id: (data as { id: number }).id };
}

/** Switches a centre off or on again. */
export async function setCentreActive(id: number, active: boolean): Promise<{ errorKey?: ParseKeys }> {
  const { error } = await supabase.from('centres').update({ active }).eq('id', id).select('id').single();
  return error ? { errorKey: errorKeyOf(error.message) } : {};
}

function errorKeyOf(message: string): ParseKeys {
  switch (message) {
    case 'centre_name_required':
      return 'centres.errors.nameRequired';
    case 'centre_name_too_long':
      return 'centres.errors.nameTooLong';
    case 'centre_name_taken':
      return 'centres.errors.nameTaken';
    case 'address_too_long':
      return 'centres.errors.addressTooLong';
    case 'location_incomplete':
    case 'location_invalid':
      return 'centres.errors.location';
    case 'radius_invalid':
      return 'centres.errors.radius';
    case 'window_invalid':
      return 'settings.errors.window';
    case 'last_centre':
      return 'centres.errors.lastCentre';
  }
  // Row-level security refuses a coordinator without an error code of its own.
  if (/row-level security|0 rows|JSON object requested/i.test(message)) return 'centres.errors.notAllowed';
  if (isNetworkError(message)) return 'common.networkError';
  return 'common.genericError';
}
