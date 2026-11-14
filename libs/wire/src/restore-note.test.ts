import { expect, test } from 'bun:test';
import { restoreNoteSchema } from './restore-note';

test('it accepts a note that names a key snapshot', () => {
  const note = { format: 1, restoredAt: 1_798_761_660_000, keySnapshotID: 'a'.repeat(64) } as const;

  expect(restoreNoteSchema.safeParse(note).data).toStrictEqual(note);
});

test('it accepts a note that names no key snapshot', () => {
  const note = { format: 1, restoredAt: 1_798_761_660_000, keySnapshotID: null } as const;

  expect(restoreNoteSchema.safeParse(note).data).toStrictEqual(note);
});

test('it refuses an extra key', () => {
  const note = { format: 1, restoredAt: 1_798_761_660_000, keySnapshotID: null, extra: true };

  expect(restoreNoteSchema.safeParse(note).success).toBeFalse();
});

test('it refuses a snapshot ID that is not a full restic ID', () => {
  const note = { format: 1, restoredAt: 1_798_761_660_000, keySnapshotID: 'a1b2c3d4' };

  expect(restoreNoteSchema.safeParse(note).success).toBeFalse();
});

test('it refuses a format other than 1', () => {
  const note = { format: 2, restoredAt: 1_798_761_660_000, keySnapshotID: null } as const;

  expect(restoreNoteSchema.safeParse(note).success).toBeFalse();
});
