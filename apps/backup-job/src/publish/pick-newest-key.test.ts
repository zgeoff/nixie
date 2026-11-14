import { expect, test } from 'bun:test';
import { buildPublishedSnapshot } from '../test-utils/build-published-snapshot';
import { pickNewestKey } from './pick-newest-key';

test('it returns null for no key snapshot', () => {
  expect(pickNewestKey([])).toBeNull();
});

test('it takes the highest publish number, whatever the time', () => {
  const older = buildPublishedSnapshot({ snapshotID: 'b'.repeat(64), publish: 4, writtenAt: 9000 });
  const newer = buildPublishedSnapshot({ snapshotID: 'c'.repeat(64), publish: 5, writtenAt: 1000 });

  expect(pickNewestKey([newer, older])).toStrictEqual(newer);
});

test('it drops an unnumbered snapshot that another names in legacy-set', () => {
  const legacy = buildPublishedSnapshot({ snapshotID: 'b'.repeat(64), set: 5, writtenAt: 9000 });

  const numbered = buildPublishedSnapshot({
    snapshotID: 'c'.repeat(64),
    set: 6,
    publish: 1,
    legacySet: 5,
    writtenAt: 1000,
  });

  expect(pickNewestKey([legacy, numbered])).toStrictEqual(numbered);
});

test('it takes the latest by time while an unnumbered snapshot is left', () => {
  const older = buildPublishedSnapshot({ snapshotID: 'b'.repeat(64), set: 5, writtenAt: 1000 });
  const newer = buildPublishedSnapshot({ snapshotID: 'c'.repeat(64), set: 6, writtenAt: 2000 });

  const numbered = buildPublishedSnapshot({
    snapshotID: 'd'.repeat(64),
    set: 4,
    publish: 1,
    legacySet: 3,
    writtenAt: 500,
  });

  expect(pickNewestKey([older, numbered, newer])).toStrictEqual(newer);
});

test('it takes the later time on a tie of publish numbers', () => {
  const first = buildPublishedSnapshot({ snapshotID: 'b'.repeat(64), publish: 3, writtenAt: 1000 });

  const second = buildPublishedSnapshot({
    snapshotID: 'c'.repeat(64),
    publish: 3,
    writtenAt: 2000,
  });

  expect(pickNewestKey([second, first])).toStrictEqual(second);
});
