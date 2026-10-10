// Printed QR cards for students without a phone (Phase 3 P3-1, docs/DECISIONS.md #249-#252): the
// students a card can be printed for, their codes, and the Guru's "replace a lost card"
// (reissue_qr_code, supabase/migrations/0045_qr_cards.sql). A card carries the same code as My QR
// (studentQrText, #17), so the attendance scanner (C5) needs nothing new. Staff may read every
// student (row-level security as before); the print screen keeps a coordinator to their own
// centre's students (#251).

import { supabase } from '@/lib/supabase';

import { studentQrText } from './attendance';
import { fallbackErrorKey, type MessageKey } from './errors';
import type { StudentStatus } from './student-overview';

/** A student a card can be printed for. */
export type CardStudent = {
  id: string;
  fullName: string;
  rollNo: string;
  centreId: number;
  centreName: string;
  levelId: number;
  status: StudentStatus;
  /** Has a login of their own, so My QR on a phone (they may still want a card). */
  hasLogin: boolean;
};

type CardRow = {
  id: string;
  full_name: string;
  roll_no: string;
  home_centre_id: number;
  level_id: number;
  status: StudentStatus;
  profile_id: string | null;
  centre: { name: string } | null;
};

/**
 * Every student whose record is not frozen by a withdrawal, by name; null when it could not be
 * loaded. The codes are not read here: only for the students picked (fetchQrTexts).
 */
export async function fetchCardStudents(): Promise<CardStudent[] | null> {
  const { data, error } = await supabase
    .from('students')
    .select('id, full_name, roll_no, home_centre_id, level_id, status, profile_id, centre:centres(name)')
    .is('withdrawn_at', null)
    .order('full_name');
  if (error) return null;
  return (data as unknown as CardRow[]).map((row) => ({
    id: row.id,
    fullName: row.full_name,
    rollNo: row.roll_no,
    centreId: row.home_centre_id,
    centreName: row.centre?.name ?? '',
    levelId: row.level_id,
    status: row.status,
    hasLogin: row.profile_id !== null,
  }));
}

/** The QR text (MS1:<qr_token>) of each student in `ids`, by id; null when it could not be loaded. */
export async function fetchQrTexts(ids: string[]): Promise<Map<string, string> | null> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase.from('students').select('id, qr_token').in('id', ids);
  if (error) return null;
  return new Map((data as { id: string; qr_token: string }[]).map((row) => [row.id, studentQrText(row.qr_token)]));
}

/**
 * The Guru replaces a lost card: the student gets a new code, and the old card (and the old My QR
 * code on a phone that has not been online since) scans as "Code not recognised".
 */
export async function reissueQrCode(studentId: string): Promise<{ errorKey?: MessageKey }> {
  const { error } = await supabase.rpc('reissue_qr_code', { p_student: studentId });
  if (!error) return {};
  if (error.message === 'not_allowed') return { errorKey: 'qrCards.errors.notAllowed' };
  if (error.message === 'student_withdrawn') return { errorKey: 'qrCards.errors.withdrawn' };
  if (error.message === 'student_not_found') return { errorKey: 'attendance.errors.notFound' };
  return { errorKey: fallbackErrorKey(error.message) };
}
