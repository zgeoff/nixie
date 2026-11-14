import { expect, test } from 'bun:test';
import { buildPublishedSnapshot } from './build-published-snapshot';

test('it builds an unnumbered snapshot, with the overrides applied', () => {
  expect(buildPublishedSnapshot({ set: 3 })).toStrictEqual({
    snapshotID: 'a'.repeat(64),
    writtenAt: 1000,
    set: 3,
    kind: 'scheduled',
    publish: null,
    legacySet: null,
    provenFrom: null,
  });
});
