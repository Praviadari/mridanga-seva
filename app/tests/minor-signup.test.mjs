// Unit tests for a child's sign-up at home with the parent's consent by email (migration 0051, docs/DECISIONS.md #399):
// the parent's details as the sign-up checks them (the same rules as the database's clean_parent_details), what Register
// a student offers for a child's sign-up, the error messages, and the screens wired to the right functions. Run from app/:
// npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import './stubs/register.mjs';

const { acceptMinorErrorKey, checkParentDetails, parentRequestErrorKey } = await import('../src/data/minor-signup.ts');
const { waitingAction } = await import('../src/lib/waiting-list.ts');

const src = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const good = { name: 'Radha Devi', relation: 'mother', email: 'radha@example.com', phone: '+919800051052', phoneTyped: true };

test("the parent's details: a name by the name rule, mother / father / guardian, the parent's own email, a mobile number", () => {
  assert.deepEqual(checkParentDetails(good, 'child@example.com'), {});
  assert.deepEqual(checkParentDetails({ ...good, name: '' }, 'c@example.com'), { parentName: 'minorSignUp.parentNameRequired' });
  assert.equal(checkParentDetails({ ...good, name: 'Radha 2' }, 'c@example.com').parentName, 'validation.nameDigits');
  assert.equal(checkParentDetails({ ...good, relation: null }, 'c@example.com').parentRelation, 'signUp.choose');
  assert.equal(checkParentDetails({ ...good, relation: 'uncle' }, 'c@example.com').parentRelation, 'signUp.choose');
  assert.equal(checkParentDetails({ ...good, email: 'radha-at-example' }, 'c@example.com').parentEmail, 'validation.emailInvalid');
  assert.equal(checkParentDetails({ ...good, email: ' Child@Example.com ' }, 'child@example.com').parentEmail, 'minorSignUp.parentEmailOwn',
    'the child\'s own sign-in email is refused, whatever its case');
  assert.equal(checkParentDetails({ ...good, phone: null, phoneTyped: false }, 'c@example.com').parentPhone, 'minorSignUp.parentPhoneRequired');
  assert.equal(checkParentDetails({ ...good, phone: null, phoneTyped: true }, 'c@example.com').parentPhone, 'about.errors.phoneInvalid');
});

test('Register a student: a child whose parent consented gets Accept; otherwise the form', () => {
  const year = new Date().getFullYear();
  const child = { full_name: 'Gopal Rao', dob: `${year - 12}-03-10`, notice_version: '0.2-draft' };
  const parent = { name: 'Radha Rao', relation: 'mother', email: 'r@example.com', phone: '+919800051052', consented_at: null, photo_consent: null };
  assert.equal(waitingAction({ ...child, parent: { ...parent, state: 'consented', consented_at: '2026-10-21T10:00:00Z' } }), 'acceptMinor');
  assert.equal(waitingAction({ ...child, parent: { ...parent, state: 'awaiting_parent' } }), 'minor', 'not listed by 0051; the form if ever');
  assert.equal(waitingAction({ ...child, parent: null }), 'minor', 'no request (an older app, or expired): the desk with a parent');
  assert.equal(waitingAction(child), 'minor', 'a server before 0051');
  assert.equal(waitingAction({ ...child, full_name: 'Gopal 2', parent: { ...parent, state: 'consented' } }), 'name',
    'a name from before the name rule still goes through the form');
  assert.equal(waitingAction({ ...child, dob: '1990-01-01', parent: null }), 'accept', 'adults as before');
});

test('the database\'s answers become messages', () => {
  assert.equal(acceptMinorErrorKey('id_type_required'), 'register.minorAccept.idRequired');
  assert.equal(acceptMinorErrorKey('parent_not_consented'), 'register.minorAccept.notConsented');
  assert.equal(acceptMinorErrorKey('minor_needs_desk'), 'register.acceptErrors.minor');
  assert.equal(acceptMinorErrorKey('student_withdrawn'), 'common.studentWithdrawn');
  assert.equal(acceptMinorErrorKey('Failed to fetch'), 'common.networkError');
  assert.equal(parentRequestErrorKey('mail_too_soon'), 'minorSignUp.errors.tooSoon');
  assert.equal(parentRequestErrorKey('mail_limit'), 'minorSignUp.errors.limit');
  assert.equal(parentRequestErrorKey('parent_email_own'), 'minorSignUp.parentEmailOwn');
  assert.equal(parentRequestErrorKey('something_new'), 'common.genericError');
});

test('the screens: sign-up sends the parent, the consent page is open to all, the desk accepts a child with the ID seen', () => {
  const signUp = src('app/sign-up.tsx');
  assert.ok(!signUp.includes('under18Desk'), 'no more "come to the desk" for a child at sign-up');
  assert.match(signUp, /checkParentDetails\(parentForm, email\)/);
  assert.match(signUp, /parent:\s*\n?\s*minor && parentRelation && parentForm\.phone/);
  const actions = src('auth/auth-actions.ts');
  for (const key of ['parent_name', 'parent_relation', 'parent_email', 'parent_phone']) assert.ok(actions.includes(`${key}:`), key);

  const layout = src('app/_layout.tsx');
  const consentAt = layout.indexOf('<Stack.Screen name="parent-consent"');
  assert.ok(consentAt > 0 && consentAt < layout.indexOf('<Stack.Protected guard='), 'the consent page is outside every guard');
  const page = src('app/parent-consent.tsx');
  assert.match(page, /giveParentConsent\(/);
  assert.ok(!/useLocalSearchParams<\{[^}]*code/.test(page), 'the code never comes from the address');
  assert.match(page, /const \[photoOk, setPhotoOk\] = useState\(false\)/, 'photos unticked by default');

  const register = src('app/staff/register.tsx');
  assert.match(register, /acceptMinorSignUp\(person\.id, acceptIdType\)/);
  assert.match(register, /if \(child && !acceptIdType\)/);

  const pending = src('app/pending.tsx');
  assert.match(pending, /useAboutPrompt\(profile\?\.id, '\/about-you', waitingForDesk && !minor\)/, 'About you is not offered to a child');
});
