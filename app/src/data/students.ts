// Registering students (screens C2 + C3): the form's data, its checks, and the call to the
// database function register_student (supabase/migrations/0003_register_student.sql).
// The database repeats every rule that matters, so a bug here cannot store a minor without
// consent (docs/DATABASE.md "Registering a student").

import * as Crypto from 'expo-crypto';
import type { ParseKeys } from 'i18next';

import { ageOn, isMinorOn, parseDayMonthYear, todayLocal } from '@/lib/dates';
import { toE164 } from '@/lib/phone';
import { PRIVACY_NOTICE_VERSION } from '@/lib/privacy-notice';
import { supabase } from '@/lib/supabase';

import { isNetworkError } from './errors';

/** A translation key for a message. */
type MessageKey = ParseKeys;

/** Who the guardian is to the student. Stored as this code in guardians.relation. */
export const RELATIONS = ['mother', 'father', 'guardian'] as const;
export type Relation = (typeof RELATIONS)[number];

/**
 * The ID a coordinator may look at to confirm the parent's identity. Only the TYPE is stored,
 * never the number (docs/DECISIONS.md #8). Stored as this code in consents.id_type_checked.
 */
export const ID_TYPES = ['aadhaar', 'pan', 'driving_licence', 'passport', 'voter_id', 'other'] as const;
export type IdType = (typeof ID_TYPES)[number];

/** Everything typed into the registration form, as text straight from the fields. */
export type RegistrationForm = {
  fullName: string;
  /** As typed, day-month-year, e.g. '15-06-2012'. */
  dob: string;
  phone: string;
  email: string;
  area: string;
  pincode: string;
  levelId: number;
  /** Profile id of the mentor coordinator, or null for "not yet". */
  mentorId: string | null;
  guardianName: string;
  guardianPhone: string;
  guardianEmail: string;
  relation: Relation | null;
  idType: IdType | null;
  photoConsent: boolean;
  /** The coordinator confirms the parent filled in and signed the paper consent form. */
  writtenConsent: boolean;
  /**
   * Random id of this form, sent with every Save of it. When the answer to a Save was lost and the
   * coordinator saves again, the database returns the student saved the first time instead of
   * storing a copy (migration 0032, docs/DECISIONS.md #126). A new form gets a new id.
   */
  requestId: string;
};

/** An empty form. The mentor starts as the person registering, if they are a coordinator. */
export function emptyRegistration(mentorId: string | null): RegistrationForm {
  return {
    fullName: '',
    dob: '',
    phone: '',
    email: '',
    area: '',
    pincode: '',
    levelId: 1,
    mentorId,
    guardianName: '',
    guardianPhone: '',
    guardianEmail: '',
    relation: null,
    idType: null,
    photoConsent: false,
    writtenConsent: false,
    requestId: Crypto.randomUUID().toLowerCase(),
  };
}

/** A problem with one field, as the key of the message to show under it. */
export type RegistrationErrors = Partial<Record<keyof RegistrationForm, MessageKey>>;

/** Removes spaces and dashes people type in phone numbers: '98765 43210' → '9876543210'. */
export function cleanPhone(phone: string): string {
  return phone.replace(/[\s-]/g, '');
}

/**
 * After cleanPhone: an Indian mobile (10 digits starting 6-9, a leading 0 allowed), or a number
 * with + and a country code that is a real number (D6-21: '0000000000' or '1234567890' would be
 * saved and make follow-up calls for a minor impossible).
 */
function isValidPhone(phone: string): boolean {
  if (phone.startsWith('+')) return toE164(phone, 'IN') !== null;
  return /^0?[6-9][0-9]{9}$/.test(phone);
}

/** An Indian PIN code: six digits, never starting with 0 (D6-21; the database checks the same, 0038). */
const PINCODE = /^[1-9][0-9]{5}$/;

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Age today and whether the student is a minor, from the typed date of birth.
 * Returns null while the date is empty or not a real date.
 */
export function ageFromForm(dob: string): { age: number; minor: boolean } | null {
  const iso = parseDayMonthYear(dob);
  if (!iso) return null;
  const today = todayLocal();
  return { age: ageOn(iso, today), minor: isMinorOn(iso, today) };
}

/**
 * Checks the student part of the form (screen C2). Returns the problems found; empty when fine.
 * Date of birth is required because it decides whether parental consent is needed.
 */
export function checkStudentDetails(form: RegistrationForm): RegistrationErrors {
  const errors: RegistrationErrors = {};
  if (!form.fullName.trim()) errors.fullName = 'register.errors.nameRequired';
  const today = todayLocal();
  const iso = parseDayMonthYear(form.dob);
  // Not a real date, in the future, or an obvious typing slip (over 100 years old).
  if (!iso || iso > today || ageOn(iso, today) > 100) errors.dob = 'register.errors.dobInvalid';
  if (form.phone.trim() && !isValidPhone(cleanPhone(form.phone))) errors.phone = 'register.errors.phoneInvalid';
  if (form.email.trim() && !isValidEmail(form.email)) errors.email = 'validation.emailInvalid';
  if (form.pincode.trim() && !PINCODE.test(form.pincode.trim())) {
    errors.pincode = 'register.errors.pincodeInvalid';
  }
  return errors;
}

/** Checks the guardian and consent part (screen C3), needed only for a minor. */
export function checkGuardianConsent(form: RegistrationForm): RegistrationErrors {
  const errors: RegistrationErrors = {};
  if (!form.guardianName.trim()) errors.guardianName = 'register.errors.nameRequired';
  if (!isValidPhone(cleanPhone(form.guardianPhone))) errors.guardianPhone = 'register.errors.phoneInvalid';
  if (form.guardianEmail.trim() && !isValidEmail(form.guardianEmail)) {
    errors.guardianEmail = 'validation.emailInvalid';
  }
  // D1a-15: a login with the parent's email would be linked as the child (0038).
  if (form.email.trim() && form.email.trim().toLowerCase() === form.guardianEmail.trim().toLowerCase()) {
    errors.email = 'register.errors.guardianEmailOnMinor';
  }
  if (!form.relation) errors.relation = 'register.errors.choose';
  if (!form.idType) errors.idType = 'register.errors.choose';
  if (!form.writtenConsent) errors.writtenConsent = 'register.errors.consentNeeded';
  return errors;
}

/** What the database returns for a new student. */
export type Registered = {
  id: string;
  rollNo: string;
  /** True when the student already had a confirmed app login with this email, now connected. */
  linked: boolean;
  /**
   * True when this form had been saved before (the answer was lost): nothing new was stored and
   * this is the student saved then, with the details of that first Save.
   */
  repeated: boolean;
};

/**
 * Saves the student, and for a minor the guardian and consent, in one step (all or nothing).
 * Call only after checkStudentDetails (and checkGuardianConsent for a minor) found no problems.
 * minorByServer: the database said this student is a minor although the phone's date says not
 * (a birthday today or tomorrow and a phone clock a day off, D6-13); the guardian part goes along.
 */
export async function registerStudent(
  form: RegistrationForm,
  minorByServer = false,
): Promise<{ registered?: Registered; errorKey?: MessageKey }> {
  const minor = minorByServer || (ageFromForm(form.dob)?.minor ?? false);
  const args = {
    p_full_name: form.fullName.trim(),
    p_dob: parseDayMonthYear(form.dob),
    p_phone: cleanPhone(form.phone) || null,
    p_email: form.email.trim() || null,
    p_area: form.area.trim() || null,
    p_pincode: form.pincode.trim() || null,
    p_level: form.levelId,
    p_mentor: form.mentorId,
    // Guardian and consent go to the database only for a minor.
    p_guardian_name: minor ? form.guardianName.trim() : null,
    p_guardian_phone: minor ? cleanPhone(form.guardianPhone) : null,
    p_guardian_email: minor ? form.guardianEmail.trim() || null : null,
    p_guardian_relation: minor ? form.relation : null,
    p_id_type_checked: minor ? form.idType : null,
    p_photo_consent: minor && form.photoConsent,
    // "The parent signed the paper form": required by the database for a minor (0025).
    p_written_consent: minor ? form.writtenConsent : null,
  };
  // The privacy notice the parent was shown is kept on the consent (0034). PGRST202: the database
  // has no register_student with that parameter yet; try without it, then without p_request_id
  // (before 0032).
  let { data, error } = await supabase.rpc('register_student', {
    ...args,
    p_request_id: form.requestId,
    p_notice_version: minor ? PRIVACY_NOTICE_VERSION : null,
  });
  if (error?.code === 'PGRST202')
    ({ data, error } = await supabase.rpc('register_student', { ...args, p_request_id: form.requestId }));
  if (error?.code === 'PGRST202') ({ data, error } = await supabase.rpc('register_student', args));
  if (error) return { errorKey: registerErrorKey(error.message, error.code) };
  const result = data as { id: string; roll_no: string; linked: boolean; repeated?: boolean };
  return {
    registered: { id: result.id, rollNo: result.roll_no, linked: result.linked, repeated: result.repeated === true },
  };
}

/**
 * Maps an error from register_student to a message. The codes are listed in migrations 0003, 0025
 * and 0032 (request_id_used cannot happen from this app, so it gets the general message).
 */
function registerErrorKey(message: string, code: string | undefined): MessageKey {
  switch (message) {
    case 'not_allowed':
      return 'register.errors.notAllowed';
    case 'name_required':
      return 'register.errors.nameRequired';
    case 'dob_required':
      return 'register.errors.dobInvalid';
    case 'written_consent_required':
      return 'register.errors.consentNeeded';
    case 'minor_needs_guardian':
    case 'minor_needs_id_check':
    case 'minor_needs_consent':
      return 'register.errors.minorNeedsConsent';
    case 'guardian_email_on_minor': // the email is a parent's of this or another child (0038)
      return 'register.errors.guardianEmailOnMinor';
  }
  if (code === '23514') return 'register.errors.pincodeInvalid'; // the pincode check in the table
  if (isNetworkError(message)) return 'common.networkError';
  return 'common.genericError';
}

/** A level to choose from. */
export type LevelOption = { id: number; name: string };
/** A coordinator who can be a student's mentor. */
export type MentorOption = { id: string; fullName: string };

/**
 * Loads the choices for the registration form: levels, and active coordinators as mentors.
 * Returns null when they could not be loaded (usually no internet).
 */
export async function fetchRegistrationChoices(): Promise<{
  levels: LevelOption[];
  mentors: MentorOption[];
} | null> {
  const [levels, mentors] = await Promise.all([
    supabase.from('levels').select('id, name').order('sort'),
    supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'coordinator')
      .eq('active', true)
      .order('full_name'),
  ]);
  if (levels.error || mentors.error) return null;
  return {
    levels: levels.data as LevelOption[],
    mentors: (mentors.data as { id: string; full_name: string }[]).map((m) => ({
      id: m.id,
      fullName: m.full_name,
    })),
  };
}
