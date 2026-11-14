import { expect, test } from 'bun:test';
import { parseSnapshotTags } from './parse-snapshot-tags';

test.each(['publish-0', 'publish-01', 'publish-x', 'publish-', 'publish-9007199254740993'])(
  'it reads the malformed tag %s as no publish number',
  (tag) => {
    expect(parseSnapshotTags(['set-3', tag]).publish).toBeNull();
  },
);

test('it reads an unknown kind as absent', () => {
  expect(parseSnapshotTags(['kind-weekly']).kind).toBeNull();
});

test('it reads legacy-set alone as no set', () => {
  expect(parseSnapshotTags(['legacy-set-7'])).toStrictEqual({
    set: null,
    kind: null,
    publish: null,
    legacySet: 7,
    provenFrom: null,
  });
});

test('it reads a prefix that appears twice as absent', () => {
  expect(parseSnapshotTags(['publish-2', 'publish-3', 'set-1']).publish).toBeNull();
});
