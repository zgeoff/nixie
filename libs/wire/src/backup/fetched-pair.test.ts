import { expect, test } from 'bun:test';
import { fetchedPairSchema } from './fetched-pair';

test('it accepts a pair of copies, one of them with no numbers', () => {
  const pair = {
    format: 1,
    fetchedAt: 1_798_761_660_000,
    key: { snapshotID: 'a'.repeat(64), publish: 42, set: 18, writtenAt: 1_798_761_600_000 },
    data: { snapshotID: 'b'.repeat(64), publish: null, set: null, writtenAt: 1_798_761_601_000 },
    relation: 'older-data',
  } as const;

  expect(fetchedPairSchema.safeParse(pair).data).toStrictEqual(pair);
});

test('it refuses an extra key', () => {
  const pair = {
    format: 1,
    fetchedAt: 1_798_761_660_000,
    key: { snapshotID: 'a'.repeat(64), publish: 42, set: 18, writtenAt: 1_798_761_600_000 },
    data: { snapshotID: 'b'.repeat(64), publish: 42, set: 18, writtenAt: 1_798_761_601_000 },
    relation: 'same-publish',
    extra: true,
  };

  expect(fetchedPairSchema.safeParse(pair).success).toBeFalse();
});

test('it refuses an extra key in a copy', () => {
  const pair = {
    format: 1,
    fetchedAt: 1_798_761_660_000,
    key: {
      snapshotID: 'a'.repeat(64),
      publish: 42,
      set: 18,
      writtenAt: 1_798_761_600_000,
      extra: true,
    },
    data: { snapshotID: 'b'.repeat(64), publish: 42, set: 18, writtenAt: 1_798_761_601_000 },
    relation: 'same-publish',
  };

  expect(fetchedPairSchema.safeParse(pair).success).toBeFalse();
});

test('it refuses a snapshot ID that is not a full restic ID', () => {
  const pair = {
    format: 1,
    fetchedAt: 1_798_761_660_000,
    key: { snapshotID: 'a'.repeat(64), publish: 42, set: 18, writtenAt: 1_798_761_600_000 },
    data: { snapshotID: 'b1c2d3e4', publish: 42, set: 18, writtenAt: 1_798_761_601_000 },
    relation: 'same-publish',
  };

  expect(fetchedPairSchema.safeParse(pair).success).toBeFalse();
});

test('it refuses a relation that is not a pair relation', () => {
  const pair = {
    format: 1,
    fetchedAt: 1_798_761_660_000,
    key: { snapshotID: 'a'.repeat(64), publish: 42, set: 18, writtenAt: 1_798_761_600_000 },
    data: { snapshotID: 'b'.repeat(64), publish: 42, set: 18, writtenAt: 1_798_761_601_000 },
    relation: 'newer-data',
  };

  expect(fetchedPairSchema.safeParse(pair).success).toBeFalse();
});
