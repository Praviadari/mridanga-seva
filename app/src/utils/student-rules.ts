import { StudentStatus } from '../types/database';

/**
 * Checks if a student is a minor (under 18) based on their date of birth.
 * Complies with India DPDP rules for parental consent.
 */
export function isMinorStudent(dob?: string, currentDate: Date = new Date()): boolean {
  if (!dob) return false;
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return false;

  let age = currentDate.getFullYear() - birth.getFullYear();
  const monthDiff = currentDate.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && currentDate.getDate() < birth.getDate())) {
    age--;
  }
  return age < 18;
}

/**
 * Validates a 6-digit Indian Postal PIN code
 */
export function isValidPincode(pincode?: string): boolean {
  if (!pincode) return true; // Optional in form
  return /^[0-9]{6}$/.test(pincode.trim());
}

/**
 * Generates roll number in standard format: MS-YYYY-XXXX
 */
export function formatRollNumber(year: number, sequence: number): string {
  const padded = String(sequence).padStart(4, '0');
  return `MS-${year}-${padded}`;
}

/**
 * Computes duration of a visit in rounded minutes
 */
export function calculateVisitMinutes(checkInIso: string, checkOutIso: string): number {
  const start = new Date(checkInIso).getTime();
  const end = new Date(checkOutIso).getTime();
  if (isNaN(start) || isNaN(end) || end <= start) return 0;
  return Math.round((end - start) / (60 * 1000));
}

/**
 * Verifies if student status transition is valid per Decision #4 and Database rules.
 * Status 'paused' or 'left' CAN ONLY be reached via a logged call.
 */
export function canTransitionStatus(
  toStatus: StudentStatus,
  viaCallLog: boolean
): boolean {
  if ((toStatus === 'paused' || toStatus === 'left') && !viaCallLog) {
    return false;
  }
  return true;
}
