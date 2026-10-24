// Staff sign-in codes (migration 0061, docs/DECISIONS.md #580-#584): setting up, giving and turning off one's own
// code with Supabase Auth's MFA (supabase-js, no native module), one's own state, and the Guru's list, switch and
// reset. The rules about sessions and codes are in src/auth/mfa.ts; the database decides who may do what.

import { factorName, mfaErrorKey, typedCode } from '@/auth/mfa';
import { supabase } from '@/lib/supabase';

import { fallbackErrorKey, type MessageKey } from './errors';

/** A code being set up: what the authenticator app needs (the otpauth:// link in a QR code, or the key typed in). */
export type CodeSetup = { factorId: string; uri: string; secret: string };

/**
 * Starts setting up a sign-in code: codes set up earlier but never confirmed go first (Supabase refuses a second
 * unconfirmed one), then Supabase makes a new secret. Confirmed codes stay until the new one is confirmed.
 */
export async function startCodeSetup(): Promise<CodeSetup | { errorKey: MessageKey }> {
  const listed = await supabase.auth.mfa.listFactors();
  if (listed.error) return { errorKey: mfaErrorKey(listed.error) };
  for (const factor of listed.data.all.filter((f) => f.status !== 'verified')) {
    await supabase.auth.mfa.unenroll({ factorId: factor.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: factorName(new Date()), issuer: 'Mridanga Seva' });
  if (error) return { errorKey: mfaErrorKey(error) };
  if (data?.type !== 'totp') return { errorKey: 'common.genericError' };
  return { factorId: data.id, uri: data.totp.uri, secret: data.totp.secret };
}

/**
 * Confirms a new code with one code from the authenticator app. The session then counts as having given the code
 * (aal2), and every other code of this login goes (an old phone's), so one phone holds the code (#580).
 */
export async function confirmCodeSetup(factorId: string, code: string): Promise<MessageKey | undefined> {
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: typedCode(code) });
  if (error) return mfaErrorKey(error);
  const listed = await supabase.auth.mfa.listFactors();
  for (const factor of listed.data?.all ?? []) {
    if (factor.id !== factorId) await supabase.auth.mfa.unenroll({ factorId: factor.id });
  }
  return undefined;
}

/** At sign-in: gives the code, so this session counts as having given it (#581). */
export async function giveSignInCode(factorId: string, code: string): Promise<MessageKey | undefined> {
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: typedCode(code) });
  return error ? mfaErrorKey(error) : undefined;
}

/** Removes my own codes (only offered while the Guru does not ask for codes); then reads the session again. */
export async function turnOffMyCode(): Promise<MessageKey | undefined> {
  const listed = await supabase.auth.mfa.listFactors();
  if (listed.error) return mfaErrorKey(listed.error);
  for (const factor of listed.data.all) {
    const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
    if (error) return mfaErrorKey(error);
  }
  await supabase.auth.refreshSession();
  return undefined;
}

/** My own state: does the Guru ask for codes, do I have one (null: unknown), did this session give it. */
export type MyCodeState = { required: boolean; hasCode: boolean | null; aal2: boolean };

/** Reads my state; 'missing' before migration 0061, null when it could not be read. */
export async function fetchMyCodeState(): Promise<MyCodeState | 'missing' | null> {
  const { data, error } = await supabase.rpc('my_mfa_state');
  if (error) return error.code === 'PGRST202' ? 'missing' : null;
  const d = data as { required?: boolean; has_code?: boolean | null; aal2?: boolean } | null;
  return { required: d?.required === true, hasCode: d?.has_code ?? null, aal2: d?.aal2 === true };
}

/** One staff member on the Guru's list. hasCode null: the database could not read the codes. */
export type StaffCodeLine = { id: string; fullName: string; role: 'guru' | 'coordinator'; hasCode: boolean | null; since: string | null };

/** The Guru's view: the switch, whether this session gave the code, and every active staff member. */
export type StaffCodes = { required: boolean; myAal2: boolean; staff: StaffCodeLine[] };

function staffCodesOf(data: unknown): StaffCodes {
  const d = data as {
    required?: boolean;
    my_aal2?: boolean;
    staff?: { id: string; full_name: string | null; role: 'guru' | 'coordinator'; has_code: boolean | null; since: string | null }[];
  } | null;
  return {
    required: d?.required === true,
    myAal2: d?.my_aal2 === true,
    staff: (d?.staff ?? []).map((s) => ({ id: s.id, fullName: s.full_name ?? '', role: s.role, hasCode: s.has_code, since: s.since })),
  };
}

/** Reads the Guru's list; 'missing' before migration 0061, null when it could not be read. */
export async function fetchStaffCodes(): Promise<StaffCodes | 'missing' | null> {
  const { data, error } = await supabase.rpc('staff_mfa_overview');
  if (error) return error.code === 'PGRST202' ? 'missing' : null;
  return staffCodesOf(data);
}

/** The words for a refusal of the switch or a reset (0061). */
export function staffCodesErrorKey(message: string): MessageKey {
  switch (message) {
    case 'not_allowed':
      return 'admin.guruOnly';
    case 'mfa_required':
      return 'staffCodes.giveYourCode';
    case 'staff_without_code':
      return 'staffCodes.notEveryone';
    case 'reset_in_dashboard':
      return 'staffCodes.resetInDashboard';
    default:
      return fallbackErrorKey(message);
  }
}

/** The Guru switches codes on or off (#582). */
export async function switchStaffCodes(on: boolean): Promise<{ codes: StaffCodes } | { errorKey: MessageKey }> {
  const { data, error } = await supabase.rpc('set_staff_mfa_required', { p_on: on });
  if (error) return { errorKey: staffCodesErrorKey(error.message) };
  return { codes: staffCodesOf(data) };
}

/** The Guru removes another staff member's code (#584). */
export async function resetStaffCode(profileId: string): Promise<MessageKey | undefined> {
  const { error } = await supabase.rpc('reset_staff_mfa', { p_profile: profileId });
  return error ? staffCodesErrorKey(error.message) : undefined;
}
