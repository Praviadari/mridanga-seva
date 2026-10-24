// A child under 18 signs up at home and the parent consents by email (migration 0051, docs/DECISIONS.md #399):
// the parent's details given at sign-up (checkParentDetails, the same rules as the database's
// clean_parent_details), the child's request on the waiting screen (my_parent_consent, resend_parent_email,
// set_parent_details), the parent's consent page (give_parent_consent, open to anyone) and the desk's Accept for
// such a child (accept_minor_sign_up). The 6-digit code goes from the database to the parent's email through
// the Edge Function notify-parents; it never comes back to the app.

import { isValidEmail } from '@/lib/email';
import { nameError } from '@/lib/person-name';
import { supabase } from '@/lib/supabase';

import { fallbackErrorKey, type MessageKey } from './errors';
import { ID_TYPES, RELATIONS, type Accepted, type IdType, type Relation } from './students';

/** The parent's part of the sign-up form, as typed (the phone already in E.164 or null when it is not one). */
export type ParentForm = {
  name: string;
  relation: Relation | null;
  email: string;
  /** E.164, or null when the typed number is not a mobile number. */
  phone: string | null;
  /** True when something was typed in the phone box. */
  phoneTyped: boolean;
};

export type ParentField = 'parentName' | 'parentRelation' | 'parentEmail' | 'parentPhone';

/**
 * Problems of the parent's details, by field: the name rule (letters only), mother / father / guardian, an email
 * that is not the child's own sign-in email, a mobile number. Empty when they can be sent.
 */
export function checkParentDetails(form: ParentForm, childEmail: string): Partial<Record<ParentField, MessageKey>> {
  const errors: Partial<Record<ParentField, MessageKey>> = {};
  const name = nameError(form.name, { max: 100 }, 'minorSignUp.parentNameRequired');
  if (name) errors.parentName = name;
  if (!form.relation || !RELATIONS.includes(form.relation)) errors.parentRelation = 'signUp.choose';
  const email = form.email.trim().toLowerCase();
  if (!isValidEmail(email)) errors.parentEmail = 'validation.emailInvalid';
  else if (email === childEmail.trim().toLowerCase()) errors.parentEmail = 'minorSignUp.parentEmailOwn';
  if (!form.phoneTyped) errors.parentPhone = 'minorSignUp.parentPhoneRequired';
  else if (!form.phone) errors.parentPhone = 'about.errors.phoneInvalid';
  return errors;
}

/** Where the child's request stands (my_parent_consent). */
export type ParentConsentState = 'needs_parent' | 'awaiting_parent' | 'consented';

/** The email to the parent: waiting to go, sent, not switched on (no Brevo key: a dry run), or failed. */
export type ParentMailState = 'waiting' | 'sent' | 'not_set_up' | 'failed' | null;

/** The waiting child's request, as the waiting screen shows it. */
export type MyParentConsent = {
  state: ParentConsentState;
  parentName: string | null;
  parentRelation: Relation | null;
  parentEmail: string | null;
  parentPhone: string | null;
  mail: ParentMailState;
  mailAt: string | null;
  mailsLeft: number;
  consentedAt: string | null;
  expiresAt: string | null;
};

type ConsentRow = {
  state: ParentConsentState;
  parent_name?: string | null;
  parent_relation?: Relation | null;
  parent_email?: string | null;
  parent_phone?: string | null;
  mail?: ParentMailState;
  mail_at?: string | null;
  mails_left?: number;
  consented_at?: string | null;
  expires_at?: string | null;
};

function consentOf(row: ConsentRow): MyParentConsent {
  return {
    state: row.state,
    parentName: row.parent_name ?? null,
    parentRelation: row.parent_relation ?? null,
    parentEmail: row.parent_email ?? null,
    parentPhone: row.parent_phone ?? null,
    mail: row.mail ?? null,
    mailAt: row.mail_at ?? null,
    mailsLeft: row.mails_left ?? 0,
    consentedAt: row.consented_at ?? null,
    expiresAt: row.expires_at ?? null,
  };
}

/**
 * The caller's request: null when the caller is not a waiting child (an adult, staff), 'missing' before 0051,
 * undefined when it could not be loaded.
 */
export async function fetchMyParentConsent(): Promise<MyParentConsent | null | 'missing' | undefined> {
  const { data, error } = await supabase.rpc('my_parent_consent');
  if (error) return error.code === 'PGRST202' ? 'missing' : undefined;
  return data ? consentOf(data as ConsentRow) : null;
}

/** Maps an error of resend_parent_email / set_parent_details to a message. */
export function parentRequestErrorKey(message: string): MessageKey {
  switch (message) {
    case 'mail_too_soon':
      return 'minorSignUp.errors.tooSoon';
    case 'mail_limit':
      return 'minorSignUp.errors.limit';
    case 'already_consented':
      return 'minorSignUp.errors.alreadyConsented';
    case 'not_awaiting_parent':
    case 'not_a_minor_signup':
      return 'minorSignUp.errors.notWaiting';
    case 'parent_name_invalid':
      return 'validation.nameSymbols';
    case 'parent_relation_invalid':
      return 'signUp.choose';
    case 'parent_email_invalid':
      return 'validation.emailInvalid';
    case 'parent_email_own':
      return 'minorSignUp.parentEmailOwn';
    case 'parent_phone_invalid':
      return 'about.errors.phoneInvalid';
  }
  return fallbackErrorKey(message);
}

/** Asks for the email to the parent again (a new code). */
export async function resendParentEmail(): Promise<{ consent?: MyParentConsent; errorKey?: MessageKey }> {
  const { data, error } = await supabase.rpc('resend_parent_email');
  if (error) return { errorKey: parentRequestErrorKey(error.message) };
  return { consent: consentOf(data as ConsentRow) };
}

/** Gives or corrects the parent's details before the parent consents; a new email goes to the new address. */
export async function setParentDetails(details: {
  name: string;
  relation: Relation;
  email: string;
  phone: string;
}): Promise<{ consent?: MyParentConsent; errorKey?: MessageKey }> {
  const { data, error } = await supabase.rpc('set_parent_details', {
    p_name: details.name,
    p_relation: details.relation,
    p_email: details.email.trim(),
    p_phone: details.phone,
  });
  if (error) return { errorKey: parentRequestErrorKey(error.message) };
  return { consent: consentOf(data as ConsentRow) };
}

/** What the consent page answers (give_parent_consent). */
export type ConsentResult =
  | 'consented'
  | 'already'
  | 'wrong'
  | 'too_many'
  | 'expired'
  | 'closed'
  | 'child_signed_in'
  | 'declaration_required';

/**
 * The parent's consent from the consent page, open to anyone: the email the code went to, the code, the two
 * declarations and the photo choice, with the privacy-notice version shown. The child's name comes back only
 * with the right code. errorKey: no internet, or a server without 0051.
 */
export async function giveParentConsent(input: {
  email: string;
  code: string;
  parentOk: boolean;
  dataOk: boolean;
  photoOk: boolean;
  noticeVersion: string;
}): Promise<{ result?: ConsentResult; childName?: string | null; photo?: boolean; errorKey?: MessageKey }> {
  const { data, error } = await supabase.rpc('give_parent_consent', {
    p_email: input.email.trim(),
    p_code: input.code.replace(/\s/g, ''),
    p_parent_ok: input.parentOk,
    p_data_ok: input.dataOk,
    p_photo_ok: input.photoOk,
    p_notice_version: input.noticeVersion,
  });
  if (error) return { errorKey: error.code === 'PGRST202' ? 'parentConsent.notAvailable' : fallbackErrorKey(error.message) };
  const row = data as { result: ConsentResult; child_name?: string | null; photo_consent?: boolean };
  return { result: row.result, childName: row.child_name ?? null, photo: row.photo_consent ?? false };
}

/** The parent's part of a waiting sign-up on Register a student (waiting_sign_ups, 0051). */
export type WaitingParent = {
  state: 'awaiting_parent' | 'consented';
  name: string;
  relation: Relation;
  /** Null while the Guru asks for sign-in codes and this session did not give one (0061, #583). */
  email: string | null;
  phone: string | null;
  consented_at: string | null;
  photo_consent: boolean | null;
};

/** Maps an error of accept_minor_sign_up to a message. */
export function acceptMinorErrorKey(message: string): MessageKey {
  switch (message) {
    case 'id_type_required':
      return 'register.minorAccept.idRequired';
    case 'parent_not_consented':
      return 'register.minorAccept.notConsented';
    case 'minor_needs_desk':
      return 'register.acceptErrors.minor';
    case 'not_a_minor':
      return 'register.minorAccept.notMinor';
    case 'not_allowed':
      return 'register.errors.notAllowed';
    case 'already_registered':
      return 'register.acceptErrors.alreadyRegistered';
    case 'not_waiting':
    case 'sign_up_not_found':
      return 'register.acceptErrors.notWaiting';
    case 'email_not_confirmed':
      return 'register.acceptErrors.emailNotConfirmed';
    case 'dob_required':
      return 'register.acceptErrors.noDob';
    case 'name_required':
      return 'register.acceptErrors.noName';
    case 'guardian_email_on_minor':
      return 'register.minorAccept.parentEmailTaken';
  }
  return fallbackErrorKey(message);
}

/**
 * Accept for a child whose parent consented by email: the ID the desk saw, then the student (connected to the
 * child's login), the guardian and the parent's consents in one call. Accepting again returns the first record.
 */
export async function acceptMinorSignUp(profileId: string, idType: IdType): Promise<{ accepted?: Accepted; errorKey?: MessageKey }> {
  if (!ID_TYPES.includes(idType)) return { errorKey: 'register.minorAccept.idRequired' };
  const { data, error } = await supabase.rpc('accept_minor_sign_up', { p_profile: profileId, p_id_type_checked: idType });
  if (error) return { errorKey: error.code === 'PGRST202' ? 'register.acceptErrors.unavailable' : acceptMinorErrorKey(error.message) };
  const r = data as { id: string; roll_no: string; full_name: string; linked: boolean; repeated: boolean; existing: boolean };
  return {
    accepted: { id: r.id, rollNo: r.roll_no, fullName: r.full_name, linked: r.linked, repeated: r.repeated, existing: r.existing },
  };
}
