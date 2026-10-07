// Account creation and new-student details (team MoM 05-10-2026, migration 0036, docs/DECISIONS.md
// #162-#166): the sign-up form's lists, About you (a waiting login or a student, after the first
// sign-in), the desk's details for a student record (C2, C8) and the sign-ups waiting for the desk.
// The database checks every value again; codes come from the option lists (src/data/options.ts).
// Before 0036 is on the database the functions are missing (PGRST202): the screens then hide the
// new parts, so a new app works with an old database.

import type { ParseKeys } from 'i18next';

import { formatPhone, isPhoneCountry, splitE164, toE164, type CountryCode } from '@/lib/phone';
import { supabase } from '@/lib/supabase';

import { isNetworkError } from './errors';
import { optionSetsFrom, OTHER, type Option, type OptionSets } from './options';

type MessageKey = ParseKeys;

/** The database has no such function yet (migration 0036 not run). */
const MISSING = 'PGRST202';

// ---------------------------------------------------------------- sign-up lists (A1)

/** A centre as the sign-up offers it. */
export type SignUpCentre = { id: number; name: string; city: string | null; countryCode: string };
export type SignUpChoices = { centres: SignUpCentre[]; genders: Option[]; instruments: Option[] };

/**
 * The centres and gender options for the sign-up, before anyone is signed in (sign_up_choices, the
 * one function a visitor may run, #163). 'missing' = the database has no 0036 yet; null = no answer.
 */
export async function fetchSignUpChoices(): Promise<SignUpChoices | 'missing' | null> {
  const { data, error } = await supabase.rpc('sign_up_choices');
  if (error) return error.code === MISSING ? 'missing' : null;
  const raw = data as { centres: { id: number; name: string; city: string | null; country_code: string }[]; genders: Option[];
    instruments?: Option[] };
  return {
    centres: raw.centres.map((c) => ({ id: c.id, name: c.name, city: c.city, countryCode: c.country_code })),
    genders: raw.genders,
    instruments: raw.instruments ?? [],
  };
}

/** The countries of the centres, in order of first appearance. */
export function centreCountries(centres: readonly SignUpCentre[]): string[] {
  return [...new Set(centres.map((c) => c.countryCode))];
}

/** The cities of a country's centres (a centre without a city stands for itself). */
export function centreCities(centres: readonly SignUpCentre[], country: string): string[] {
  return [...new Set(centres.filter((c) => c.countryCode === country).map((c) => c.city ?? c.name))];
}

/** The centres of a city. */
export function centresIn(centres: readonly SignUpCentre[], country: string, city: string): SignUpCentre[] {
  return centres.filter((c) => c.countryCode === country && (c.city ?? c.name) === city);
}

// ---------------------------------------------------------------- the form (About you, C2, C8)

/** Everything typed into the About-you fields, as text and codes straight from the fields. */
export type AboutForm = {
  gender: string | null;
  /** The initiated (Diksha) name, optional; the legal name stays the one on the ID. */
  dikshaName: string;
  /** Instrument option codes the person wants to learn. */
  learnInterests: string[];
  phoneCountry: CountryCode;
  phone: string;
  emergencyRelation: string | null;
  emergencyName: string;
  emergencyCountry: CountryCode;
  emergencyPhone: string;
  /** 'referral', a source code, or null. */
  heardVia: string | null;
  /** About you: the code the person was given. */
  referralCode: string;
  /** Staff: the coordinator who brought the person (instead of the code). */
  referredBy: string | null;
  heardOther: string;
  occupation: string | null;
  occupationOther: string;
  serviceAreas: string[];
  serviceOther: string;
};

/** The empty form; phones start in the centre's country. */
export function emptyAboutForm(country: string | null | undefined): AboutForm {
  const c: CountryCode = isPhoneCountry(country) ? country : 'IN';
  return {
    gender: null, dikshaName: '', learnInterests: [], phoneCountry: c, phone: '', emergencyRelation: null, emergencyName: '', emergencyCountry: c,
    emergencyPhone: '', heardVia: null, referralCode: '', referredBy: null, heardOther: '', occupation: null,
    occupationOther: '', serviceAreas: [], serviceOther: '',
  };
}

/** The saved answers (my_about, person_details) as a form. */
export function aboutFormFrom(saved: SavedAbout, country: string | null | undefined): AboutForm {
  const form = emptyAboutForm(country);
  const phone = splitE164(saved.phone);
  const emergency = splitE164(saved.emergency_phone);
  return {
    ...form,
    gender: saved.gender ?? null,
    dikshaName: saved.diksha_name ?? '',
    learnInterests: saved.learn_interests ?? [],
    phoneCountry: phone?.country ?? form.phoneCountry,
    phone: phone?.national ?? saved.phone ?? '',
    emergencyRelation: saved.emergency_relation ?? null,
    emergencyName: saved.emergency_name ?? '',
    emergencyCountry: emergency?.country ?? form.emergencyCountry,
    emergencyPhone: emergency?.national ?? saved.emergency_phone ?? '',
    heardVia: saved.heard_via ?? null,
    referredBy: saved.referred_by ?? null,
    heardOther: saved.heard_other ?? '',
    occupation: saved.occupation ?? null,
    occupationOther: saved.occupation_other ?? '',
    serviceAreas: saved.service_areas ?? [],
    serviceOther: saved.service_other ?? '',
  };
}

/** The parts of the form, saved one step at a time (About you) or all at once (staff). */
export type AboutPart = 'you' | 'emergency' | 'heard' | 'occupation';
export const ABOUT_PARTS: readonly AboutPart[] = ['you', 'emergency', 'heard', 'occupation'];

export type AboutErrors = Partial<Record<keyof AboutForm, MessageKey>>;

/** What the form needs to know about the person: under 18, and whether a guardian is on record. */
export type AboutContext = { minor: boolean; hasGuardian: boolean; staff: boolean };

/** Relations a minor's contact may have: a parent or guardian. */
export const MINOR_RELATIONS = ['mother', 'father', 'guardian'];

/** Checks the given parts. Returns the problems found; empty when fine. */
export function checkAbout(form: AboutForm, parts: readonly AboutPart[], context: AboutContext): AboutErrors {
  const errors: AboutErrors = {};
  if (parts.includes('you') && form.phone.trim() && !toE164(form.phone, form.phoneCountry)) {
    errors.phone = 'about.errors.phoneInvalid';
  }
  if (parts.includes('you') && form.dikshaName.trim().length > 80) errors.dikshaName = 'about.errors.tooLong';
  if (parts.includes('emergency')) {
    const any = !!(form.emergencyRelation || form.emergencyName.trim() || form.emergencyPhone.trim());
    const needed = context.minor && !context.hasGuardian;
    if (any || needed) {
      if (!form.emergencyRelation) errors.emergencyRelation = 'about.errors.choose';
      else if (context.minor && !MINOR_RELATIONS.includes(form.emergencyRelation)) {
        errors.emergencyRelation = 'about.errors.minorRelation';
      }
      if (!form.emergencyName.trim()) errors.emergencyName = 'about.errors.nameRequired';
      else if (form.emergencyName.trim().length > 80) errors.emergencyName = 'about.errors.tooLong';
      if (!toE164(form.emergencyPhone, form.emergencyCountry)) errors.emergencyPhone = 'about.errors.phoneInvalid';
    }
  }
  if (parts.includes('heard')) {
    if (form.heardVia === 'referral' && !context.staff && !/^[A-Za-z2-9]{6}$/.test(form.referralCode.replace(/\s/g, ''))
        && !form.referredBy) {
      errors.referralCode = 'about.errors.codeShape';
    }
    if (form.heardVia === 'referral' && context.staff && !form.referredBy) errors.referredBy = 'about.errors.choose';
    if (form.heardVia === OTHER && form.heardOther.trim().length > 80) errors.heardOther = 'about.errors.tooLong';
  }
  if (parts.includes('occupation')) {
    if (form.occupation === OTHER && form.occupationOther.trim().length > 80) errors.occupationOther = 'about.errors.tooLong';
    if (form.serviceAreas.includes(OTHER) && form.serviceOther.trim().length > 80) errors.serviceOther = 'about.errors.tooLong';
  }
  return errors;
}

/**
 * The keys to send for the given parts (save_about_me / save_student_details). Only the parts
 * shown are sent, so a step never clears the answers of another. Call after checkAbout.
 */
export function aboutPatch(form: AboutForm, parts: readonly AboutPart[], context: AboutContext): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (parts.includes('you')) {
    if (form.gender) patch.gender = form.gender;
    patch.diksha_name = form.dikshaName.trim() || null;
    patch.learn_interests = form.learnInterests;
    if (!context.staff) patch.phone = form.phone.trim() ? toE164(form.phone, form.phoneCountry) : null;
  }
  if (parts.includes('emergency')) {
    const filled = !!(form.emergencyRelation && form.emergencyName.trim() && form.emergencyPhone.trim());
    patch.emergency_relation = filled ? form.emergencyRelation : null;
    patch.emergency_name = filled ? form.emergencyName.trim() : null;
    patch.emergency_phone = filled ? toE164(form.emergencyPhone, form.emergencyCountry) : null;
  }
  if (parts.includes('heard')) {
    patch.heard_via = form.heardVia;
    if (form.heardVia === 'referral') {
      if (context.staff) patch.referred_by = form.referredBy;
      else if (form.referralCode.trim()) patch.referral_code = form.referralCode.replace(/\s/g, '');
    }
    patch.heard_other = form.heardVia === OTHER ? form.heardOther.trim() || null : null;
  }
  if (parts.includes('occupation')) {
    patch.occupation = form.occupation;
    patch.occupation_other = form.occupation === OTHER ? form.occupationOther.trim() || null : null;
    patch.service_areas = form.serviceAreas;
    patch.service_other = form.serviceAreas.includes(OTHER) ? form.serviceOther.trim() || null : null;
  }
  return patch;
}

/** Turns an error of save_about_me / save_student_details into a message. */
export function aboutErrorKey(message: string): MessageKey {
  switch (message) {
    case 'referral_code_unknown':
      return 'about.errors.codeUnknown';
    case 'phone_invalid':
      return 'about.errors.phoneInvalid';
    case 'minor_needs_emergency_contact':
      return 'about.errors.minorNeedsContact';
    case 'minor_contact_relation':
      return 'about.errors.minorRelation';
    case 'name_required':
    case 'name_too_long':
    case 'name_invalid':
      return 'about.errors.nameInvalid';
    case 'text_too_long':
      return 'about.errors.tooLong';
    case 'gender_unknown':
    case 'relation_unknown':
    case 'source_unknown':
    case 'occupation_unknown':
    case 'service_unknown':
    case 'too_many_services':
    case 'instrument_unknown':
      return 'about.errors.optionGone';
    case 'student_withdrawn':
      return 'about.errors.withdrawn';
    case 'not_allowed':
      return 'about.errors.notAllowed';
  }
  return isNetworkError(message) ? 'common.networkError' : 'common.genericError';
}

// ---------------------------------------------------------------- About you (own)

/** The person's saved answers, as the database names them. */
export type SavedAbout = {
  gender?: string | null;
  phone?: string | null;
  emergency_relation?: string | null;
  emergency_name?: string | null;
  emergency_phone?: string | null;
  heard_via?: string | null;
  referred_by?: string | null;
  heard_other?: string | null;
  occupation?: string | null;
  occupation_other?: string | null;
  service_areas?: string[] | null;
  service_other?: string | null;
  diksha_name?: string | null;
  learn_interests?: string[] | null;
};

/** my_about(): the signed-in person's own details, with the option lists. */
export type AboutMe = SavedAbout & {
  hasRecord: boolean;
  minor: boolean;
  hasGuardian: boolean;
  countryCode: string;
  /** The person gave a coordinator's code (which one is not shown). */
  referred: boolean;
  aboutState: 'skipped' | 'done' | null;
  options: OptionSets;
};

function aboutMeFrom(raw: Record<string, unknown>): AboutMe {
  return {
    ...(raw as SavedAbout),
    hasRecord: raw.has_record === true,
    minor: raw.minor === true,
    hasGuardian: raw.has_guardian === true,
    countryCode: typeof raw.country_code === 'string' ? raw.country_code : 'IN',
    referred: raw.referred === true,
    aboutState: (raw.about_state as AboutMe['aboutState']) ?? null,
    options: optionSetsFrom(raw.options as Record<string, Option[]>),
  };
}

/** Own details for About you. 'missing' before 0036; null when it failed or for staff. */
export async function fetchMyAbout(): Promise<AboutMe | 'missing' | null> {
  const { data, error } = await supabase.rpc('my_about');
  if (error) return error.code === MISSING ? 'missing' : null;
  return data ? aboutMeFrom(data as Record<string, unknown>) : null;
}

/** Saves own answers (only the keys given) and returns them as now stored. */
export async function saveAboutMe(patch: Record<string, unknown>): Promise<{ about?: AboutMe; errorKey?: MessageKey }> {
  const { data, error } = await supabase.rpc('save_about_me', { p: patch });
  if (error) return { errorKey: aboutErrorKey(error.message) };
  return { about: aboutMeFrom(data as Record<string, unknown>) };
}

// ---------------------------------------------------------------- the desk (staff)

/** A student's details for C8 (staff read person_details directly). */
export type StudentDetails = SavedAbout & { exists: boolean; gender: string | null; updatedAt: string | null };

/**
 * The details of one student (get_student_details: staff only, each read logged like a parent's
 * contact once 0034 is on the database). 'missing' before 0036; null when they could not be loaded.
 */
export async function fetchStudentDetails(studentId: string): Promise<StudentDetails | 'missing' | null> {
  const { data, error } = await supabase.rpc('get_student_details', { p_student: studentId });
  if (error) return error.code === MISSING ? 'missing' : null;
  const result = data as { gender: string | null; details: (SavedAbout & { updated_at?: string }) | null };
  const row = result.details ?? {};
  return { ...row, exists: result.details !== null, gender: result.gender, updatedAt: row.updated_at ?? null };
}

/** Saves a student's details at the desk or on C8 (only the keys given; may include gender, centre). */
export async function saveStudentDetails(studentId: string, patch: Record<string, unknown>): Promise<{ errorKey?: MessageKey; missing?: boolean }> {
  const { error } = await supabase.rpc('save_student_details', { p_student: studentId, p: patch });
  if (error?.code === MISSING) return { missing: true };
  return error ? { errorKey: aboutErrorKey(error.message) } : {};
}

/** A sign-up waiting for the desk (C2), with what the person gave. */
export type WaitingSignUp = SavedAbout & {
  id: string;
  full_name: string;
  email: string | null;
  dob: string | null;
  centre_id: number | null;
  created_at: string;
};

/** Confirmed sign-ups without a student record (own centre for a coordinator). [] before 0036. */
export async function fetchWaitingSignUps(): Promise<WaitingSignUp[] | null> {
  const { data, error } = await supabase.rpc('waiting_sign_ups');
  if (error) return error.code === MISSING ? [] : null;
  return (data as WaitingSignUp[] | null) ?? [];
}

/** A coordinator (or the Guru) a person can say brought them (staff forms only). */
export type Referrer = { id: string; fullName: string };

/** Staff who can be named as the person who brought someone. */
export async function fetchReferrers(): Promise<Referrer[] | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('role', ['guru', 'coordinator'])
    .order('full_name');
  if (error) return null;
  return (data as { id: string; full_name: string }[]).map((p) => ({ id: p.id, fullName: p.full_name }));
}

/** The signed-in staff member's referral code (A3), or null (none, or a database without 0036). */
export async function fetchMyReferralCode(profileId: string): Promise<string | null> {
  const { data, error } = await supabase.from('profiles').select('referral_code').eq('id', profileId).maybeSingle();
  if (error || !data) return null;
  return (data as { referral_code: string | null }).referral_code;
}

/** A phone for reading on C8 ('+91 98765 43210'). */
export { formatPhone };
