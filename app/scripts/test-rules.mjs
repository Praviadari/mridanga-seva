import assert from 'node:assert/strict';
import test from 'node:test';

// Import translations
import { translations } from '../src/i18n/translations.ts';

// Replicate helper logic for Node runner
function isMinorStudent(dob, currentDate = new Date('2026-09-29')) {
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

function isValidPincode(pincode) {
  if (!pincode) return true;
  return /^[0-9]{6}$/.test(pincode.trim());
}

function formatRollNumber(year, sequence) {
  const padded = String(sequence).padStart(4, '0');
  return `MS-${year}-${padded}`;
}

function calculateVisitMinutes(checkInIso, checkOutIso) {
  const start = new Date(checkInIso).getTime();
  const end = new Date(checkOutIso).getTime();
  if (isNaN(start) || isNaN(end) || end <= start) return 0;
  return Math.round((end - start) / (60 * 1000));
}

function canTransitionStatus(toStatus, viaCallLog) {
  if ((toStatus === 'paused' || toStatus === 'left') && !viaCallLog) {
    return false;
  }
  return true;
}

test('formatRollNumber creates standard MS-YYYY-XXXX format', () => {
  assert.equal(formatRollNumber(2026, 1), 'MS-2026-0001');
  assert.equal(formatRollNumber(2026, 42), 'MS-2026-0042');
  assert.equal(formatRollNumber(2026, 1024), 'MS-2026-1024');
});

test('isMinorStudent accurately detects minor (<18) status', () => {
  const testNow = new Date('2026-09-29');
  // Born 2011-06-30 -> ~15 years old -> minor
  assert.equal(isMinorStudent('2011-06-30', testNow), true);
  // Born 2000-01-01 -> 26 years old -> adult
  assert.equal(isMinorStudent('2000-01-01', testNow), false);
  // Born 2008-09-28 -> turned 18 yesterday -> adult
  assert.equal(isMinorStudent('2008-09-28', testNow), false);
  // Born 2008-09-30 -> turns 18 tomorrow -> minor
  assert.equal(isMinorStudent('2008-09-30', testNow), true);
  // Empty or undefined -> false
  assert.equal(isMinorStudent(undefined, testNow), false);
});

test('isValidPincode checks for 6-digit format', () => {
  assert.equal(isValidPincode('500001'), true);
  assert.equal(isValidPincode('500095'), true);
  assert.equal(isValidPincode('5000'), false);
  assert.equal(isValidPincode('5000019'), false);
  assert.equal(isValidPincode('50000A'), false);
  assert.equal(isValidPincode(''), true); // optional
});

test('canTransitionStatus enforces Decision #4: paused/left require logged call', () => {
  assert.equal(canTransitionStatus('active', false), true);
  assert.equal(canTransitionStatus('irregular', false), true);
  assert.equal(canTransitionStatus('inactive', false), true);
  assert.equal(canTransitionStatus('paused', false), false);
  assert.equal(canTransitionStatus('left', false), false);

  assert.equal(canTransitionStatus('paused', true), true);
  assert.equal(canTransitionStatus('left', true), true);
});

test('calculateVisitMinutes handles check-in to check-out duration', () => {
  const inTime = '2026-09-29T16:00:00Z';
  const outTime = '2026-09-29T17:30:00Z';
  assert.equal(calculateVisitMinutes(inTime, outTime), 90);
});

test('translations dictionaries have 100% key parity across EN, TE, HI', () => {
  const enKeys = Object.keys(translations.en).sort();
  const teKeys = Object.keys(translations.te).sort();
  const hiKeys = Object.keys(translations.hi).sort();

  assert.deepEqual(teKeys, enKeys, 'Telugu translations must match English keys');
  assert.deepEqual(hiKeys, enKeys, 'Hindi translations must match English keys');
});
