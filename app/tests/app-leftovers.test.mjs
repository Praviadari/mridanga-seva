// Unit tests for the app leftovers (audit 01-10-2026, Low/Info; docs/DECISIONS.md #216-#223): drafts kept
// after a forced sign-out go back only to the same login (D6-20 part 2), and the arrow keys of a radio group
// (src/lib/space-key.ts). Run from app/: npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import './stubs/register.mjs';

// The device's storage: a plain map in Node (src/lib/local-storage.ts uses the global localStorage).
const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
};

const drafts = await import('../src/lib/form-drafts.ts');
const { arrowStep, nextIndex } = await import('../src/lib/space-key.ts');

/** Puts drafts on the device as keepOpenDrafts writes them. */
function stored(owner, forms, savedAt = Date.now()) {
  store.set('formDrafts', JSON.stringify({ owner, savedAt, forms }));
}

test('D6-20: a kept draft goes back to the same login only', () => {
  stored('user-a', { register: { form: { fullName: 'Radha' } } });
  assert.deepEqual(drafts.peekDraft('register', 'user-a'), { form: { fullName: 'Radha' } });
  assert.equal(drafts.peekDraft('register', 'user-b'), null, 'another login never sees it');
  assert.equal(drafts.peekDraft('register', null), null, 'nobody signed in sees nothing');
  assert.equal(drafts.peekDraft('announcement-new', 'user-a'), null, 'only the form it was kept for');
});

test('D6-20: another login signing in deletes the drafts; the same login keeps them', () => {
  stored('user-a', { register: { x: 1 } });
  drafts.dropOtherOwnersDrafts('user-a');
  assert.notEqual(store.get('formDrafts'), undefined);
  drafts.dropOtherOwnersDrafts('user-b');
  assert.equal(store.get('formDrafts'), undefined);
});

test('D6-20: own Sign out deletes every draft', () => {
  stored('user-a', { register: { x: 1 }, 'announcement-new': { y: 2 } });
  drafts.dropAllDrafts();
  assert.equal(store.get('formDrafts'), undefined);
});

test('D6-20: a shown draft is deleted, the other forms stay', () => {
  stored('user-a', { register: { x: 1 }, 'announcement-new': { y: 2 } });
  drafts.discardDraft('register');
  assert.equal(drafts.peekDraft('register', 'user-a'), null);
  assert.deepEqual(drafts.peekDraft('announcement-new', 'user-a'), { y: 2 });
  drafts.discardDraft('announcement-new');
  assert.equal(store.get('formDrafts'), undefined, 'nothing left: the key goes too');
});

test(`D6-20: a draft older than ${drafts.DRAFT_DAYS} days is ignored and deleted; damaged storage too`, () => {
  stored('user-a', { register: { x: 1 } }, Date.now() - (drafts.DRAFT_DAYS + 1) * 24 * 60 * 60 * 1000);
  assert.equal(drafts.peekDraft('register', 'user-a'), null);
  assert.equal(store.get('formDrafts'), undefined);
  store.set('formDrafts', '{not json');
  assert.equal(drafts.peekDraft('register', 'user-a'), null);
  assert.equal(store.get('formDrafts'), undefined);
});

test('D6-20: with no form open a forced sign-out writes nothing', () => {
  store.clear();
  drafts.keepOpenDrafts();
  assert.equal(store.get('formDrafts'), undefined);
});

test('radio groups: the arrow keys move to the next or previous choice, round at the ends', () => {
  assert.equal(arrowStep('ArrowRight'), 1);
  assert.equal(arrowStep('ArrowDown'), 1);
  assert.equal(arrowStep('ArrowLeft'), -1);
  assert.equal(arrowStep('ArrowUp'), -1);
  assert.equal(arrowStep('Tab'), undefined);
  assert.equal(arrowStep(' '), undefined);
  assert.equal(nextIndex(0, 1, 3), 1);
  assert.equal(nextIndex(2, 1, 3), 0);
  assert.equal(nextIndex(0, -1, 3), 2);
});
