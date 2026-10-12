// Unit tests for Register a student's desk fixes (reg-accept; docs/DECISIONS.md #263-#266, audit
// P1-04 / F2-02): a new request id per person, and a repeated Save that came back with another
// person's record is caught, not shown as this person's roll number. Run from app/: npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import './stubs/register.mjs';

const { emptyRegistration, newRequestId, repeatedOtherPerson } = await import('../src/data/students.ts');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('each new form and each new person gets its own lower-case request id', () => {
  const ids = new Set([newRequestId(), newRequestId(), emptyRegistration(null).requestId, emptyRegistration(null).requestId]);
  assert.equal(ids.size, 4);
  for (const id of ids) assert.match(id, UUID);
});

test('a repeat of the same person is fine; a repeat that returned another person is caught', () => {
  const stored = { id: 's1', rollNo: 'MS-2026-0012', linked: false, repeated: true, fullName: 'Asha  Rao' };
  assert.equal(repeatedOtherPerson(stored, ' asha rao '), false);
  assert.equal(repeatedOtherPerson(stored, 'Bhavani Devi'), true);
  assert.equal(repeatedOtherPerson({ ...stored, repeated: false }, 'Bhavani Devi'), false);
});
