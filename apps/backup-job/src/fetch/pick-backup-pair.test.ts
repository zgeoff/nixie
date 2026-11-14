import { expect, test } from 'bun:test';
import type { PairRelation } from '@heynixie/wire';
import type { PublishedSnapshot } from '../publish/backup-repository';
import { buildPublishedSnapshot } from '../test-utils/build-published-snapshot';
import type { PairRefusal } from './pick-backup-pair';
import { fetchRepickLimit, pickBackupPair } from './pick-backup-pair';

test('it allows 3 repicks', () => {
  expect(fetchRepickLimit).toBe(3);
});

test.each<[string, Partial<PublishedSnapshot>, Partial<PublishedSnapshot>, PairRelation]>([
  [
    'numbered key and numbered data of the same publish number',
    { publish: 5 },
    { publish: 5 },
    'same-publish',
  ],
  [
    'numbered key and numbered data of a lower publish number at or above proven-from',
    { publish: 5, provenFrom: 3 },
    { publish: 3 },
    'older-data',
  ],
  [
    'numbered key and numbered data of a lower publish number with no proven-from',
    { publish: 5 },
    { publish: 2 },
    'older-data',
  ],
  [
    'numbered key and unnumbered data with set at or below legacy-set, and no proven-from',
    { publish: 5, legacySet: 4 },
    { set: 4 },
    'older-data',
  ],
  ['unnumbered key and unnumbered data of a lower set', { set: 4 }, { set: 3 }, 'older-data'],
])('it picks %s as %s', (_title, keyOverrides, dataOverrides, relation) => {
  const key = buildPublishedSnapshot({ snapshotID: 'a'.repeat(64), ...keyOverrides });
  const data = buildPublishedSnapshot({ snapshotID: 'b'.repeat(64), ...dataOverrides });

  expect(pickBackupPair([key], [data], 'b'.repeat(64))).toStrictEqual({ key, data, relation });
});

test('it picks an unnumbered key and unnumbered data of the same set as same-publish', () => {
  const key = buildPublishedSnapshot({ snapshotID: 'a'.repeat(64), set: 4 });
  const data = buildPublishedSnapshot({ snapshotID: 'b'.repeat(64), set: 4 });

  expect(pickBackupPair([key], [data], 'b'.repeat(64))).toStrictEqual({
    key,
    data,
    relation: 'same-publish',
  });
});

test.each<[string, Partial<PublishedSnapshot>, Partial<PublishedSnapshot>, PairRefusal]>([
  [
    'numbered data of a higher publish number than a numbered key',
    { publish: 5 },
    { publish: 6 },
    'data-newer-than-keys',
  ],
  [
    'numbered data of a lower publish number below proven-from',
    { publish: 5, provenFrom: 4 },
    { publish: 3 },
    'data-unproven',
  ],
  [
    'unnumbered data under a numbered key with proven-from',
    { publish: 5, legacySet: 4, provenFrom: 5 },
    { set: 4 },
    'data-unproven',
  ],
  [
    'unnumbered data of a set above legacy-set under a numbered key',
    { publish: 5, legacySet: 4 },
    { set: 5 },
    'data-unproven',
  ],
  [
    'unnumbered data of a higher set than an unnumbered key',
    { set: 4 },
    { set: 5 },
    'data-newer-than-keys',
  ],
  ['numbered data under an unnumbered key', { set: 4 }, { publish: 5, set: 4 }, 'data-unproven'],
  [
    'unnumbered data with no set under an unnumbered key',
    { set: 4 },
    { set: null },
    'data-unproven',
  ],
])('it refuses %s with %s', (_title, keyOverrides, dataOverrides, refused) => {
  const key = buildPublishedSnapshot({ snapshotID: 'a'.repeat(64), ...keyOverrides });
  const data = buildPublishedSnapshot({ snapshotID: 'b'.repeat(64), ...dataOverrides });

  expect(pickBackupPair([key], [data], 'b'.repeat(64))).toStrictEqual({
    refused,
    message: expect.stringContaining('b'.repeat(64)),
  });
});

test('it refuses with no-key-snapshot when the key repository holds none', () => {
  const data = buildPublishedSnapshot({ snapshotID: 'b'.repeat(64), publish: 1 });

  expect(pickBackupPair([], [data], null)).toStrictEqual({
    refused: 'no-key-snapshot',
    message: expect.any(String),
  });
});

test('it refuses with no-such-data-snapshot for an ID the data repository lacks, and matches no prefix', () => {
  const key = buildPublishedSnapshot({ snapshotID: 'a'.repeat(64), publish: 1 });
  const data = buildPublishedSnapshot({ snapshotID: 'b'.repeat(64), publish: 1 });

  expect(pickBackupPair([key], [data], 'b'.repeat(8))).toStrictEqual({
    refused: 'no-such-data-snapshot',
    message: `the data repository holds no data snapshot ${'b'.repeat(8)}`,
  });
});

test('it refuses with duplicate-publish when 2 data snapshots hold the key publish number', () => {
  const key = buildPublishedSnapshot({ snapshotID: 'a'.repeat(64), publish: 3 });
  const first = buildPublishedSnapshot({ snapshotID: 'b'.repeat(64), publish: 3 });
  const second = buildPublishedSnapshot({ snapshotID: 'c'.repeat(64), publish: 3 });

  expect(pickBackupPair([key], [first, second], null)).toStrictEqual({
    refused: 'duplicate-publish',
    message: `data snapshots ${'b'.repeat(64)}, ${'c'.repeat(64)} all hold publish number 3`,
  });
});

test('it names the data snapshot with the highest publish number that the key vouches for when none has the key publish number', () => {
  const key = buildPublishedSnapshot({ snapshotID: 'a'.repeat(64), publish: 9, provenFrom: 4 });

  const data = [
    buildPublishedSnapshot({ snapshotID: '1'.repeat(64), publish: 3 }),
    buildPublishedSnapshot({ snapshotID: '2'.repeat(64), publish: 7 }),
    buildPublishedSnapshot({ snapshotID: '3'.repeat(64), publish: 5 }),
    buildPublishedSnapshot({ snapshotID: '4'.repeat(64), publish: 10 }),
  ];

  expect(pickBackupPair([key], data, null)).toStrictEqual({
    refused: 'no-data-of-publish',
    message: expect.stringContaining('2'.repeat(64)),
  });
});

test('it names the key snapshot when no data snapshot can go with it', () => {
  const key = buildPublishedSnapshot({ snapshotID: 'a'.repeat(64), publish: 9 });

  expect(pickBackupPair([key], [], null)).toStrictEqual({
    refused: 'no-data-of-publish',
    message: `the data repository holds no data snapshot of key snapshot ${'a'.repeat(64)}: no data snapshot can go with key snapshot ${'a'.repeat(64)}`,
  });
});

test('it refuses an unnumbered key with no data snapshot of its set with no-data-of-publish', () => {
  const key = buildPublishedSnapshot({ snapshotID: 'a'.repeat(64), set: 4 });
  const data = buildPublishedSnapshot({ snapshotID: 'b'.repeat(64), set: 3 });

  expect(pickBackupPair([key], [data], null)).toStrictEqual({
    refused: 'no-data-of-publish',
    message: expect.stringContaining('b'.repeat(64)),
  });
});

test('it picks the data snapshot of the key publish number by default', () => {
  const key = buildPublishedSnapshot({ snapshotID: 'a'.repeat(64), publish: 42, set: 7 });
  const data = buildPublishedSnapshot({ snapshotID: 'b'.repeat(64), publish: 42, set: 7 });
  const older = buildPublishedSnapshot({ snapshotID: 'c'.repeat(64), publish: 41, set: 6 });

  expect(pickBackupPair([key], [older, data], null)).toStrictEqual({
    key,
    data,
    relation: 'same-publish',
  });
});

test('it picks the later of 2 unnumbered data snapshots of the key set by restic time', () => {
  const key = buildPublishedSnapshot({ snapshotID: 'a'.repeat(64), set: 4, writtenAt: 5000 });
  const earlier = buildPublishedSnapshot({ snapshotID: 'b'.repeat(64), set: 4, writtenAt: 1000 });
  const later = buildPublishedSnapshot({ snapshotID: 'c'.repeat(64), set: 4, writtenAt: 2000 });
  const otherSet = buildPublishedSnapshot({ snapshotID: 'd'.repeat(64), set: 3, writtenAt: 9000 });

  expect(pickBackupPair([key], [earlier, later, otherSet], null)).toStrictEqual({
    key,
    data: later,
    relation: 'same-publish',
  });
});

test('it never takes a key snapshot that a legacy-set tag replaced', () => {
  const legacy = buildPublishedSnapshot({ snapshotID: 'e'.repeat(64), set: 17, writtenAt: 9000 });

  const key = buildPublishedSnapshot({
    snapshotID: 'a'.repeat(64),
    set: 18,
    publish: 1,
    legacySet: 17,
  });

  const data = buildPublishedSnapshot({ snapshotID: 'b'.repeat(64), set: 18, publish: 1 });

  expect(pickBackupPair([legacy, key], [data], null)).toStrictEqual({
    key,
    data,
    relation: 'same-publish',
  });
});

test('it takes the later key snapshot by restic time when none is numbered', () => {
  const earlier = buildPublishedSnapshot({ snapshotID: 'e'.repeat(64), set: 3, writtenAt: 1000 });
  const later = buildPublishedSnapshot({ snapshotID: 'a'.repeat(64), set: 2, writtenAt: 2000 });
  const data = buildPublishedSnapshot({ snapshotID: 'b'.repeat(64), set: 2, writtenAt: 1500 });

  expect(pickBackupPair([earlier, later], [data], null)).toStrictEqual({
    key: later,
    data,
    relation: 'same-publish',
  });
});
