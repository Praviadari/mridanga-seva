// Unit tests for src/lib/announcement-receipt.ts: the staff detail (C15) shows the reader's own
// receipt right after the first opening without loading everything again (audit D9-09).
// Run from app/: npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { withMyReceipt } = await import('../src/lib/announcement-receipt.ts');

const detail = () => ({
  announcement: { id: 7, readByMe: false },
  seenCount: { addressed: 3, seen: 1, noLogin: 0, replies: 0 },
  audience: [
    { profileId: 'me', fullName: 'Me', rollNo: null, readAt: null },
    { profileId: 'other', fullName: 'Other', rollNo: 'MS-2026-0001', readAt: '2026-10-01T10:00:00Z' },
  ],
  groupName: null,
});

test('an addressed reader is listed as seen and counted once more', () => {
  const after = withMyReceipt(detail(), 'me', '2026-10-07T12:00:00Z');
  assert.equal(after.announcement.readByMe, true);
  assert.equal(after.seenCount.seen, 2);
  assert.equal(after.audience[0].readAt, '2026-10-07T12:00:00Z');
  assert.equal(after.audience[1].readAt, '2026-10-01T10:00:00Z');
  assert.equal(after.groupName, null);
});

test('a reader it is not addressed to (e.g. the Guru) changes no count', () => {
  const before = detail();
  const after = withMyReceipt(before, 'guru', '2026-10-07T12:00:00Z');
  assert.equal(after.announcement.readByMe, true);
  assert.equal(after.seenCount.seen, 1);
  assert.deepEqual(after.audience, before.audience);
  assert.equal(before.announcement.readByMe, false, 'the loaded detail is not changed in place');
});
