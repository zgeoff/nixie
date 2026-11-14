import { expect, test } from 'bun:test';
import { formatSnapshotTags } from './format-snapshot-tags';
import { parseSnapshotTags } from './parse-snapshot-tags';

test('it formats tags that parse back to the same values', () => {
  const values = { set: 18, kind: 'forget', publish: 42, legacySet: 17, provenFrom: 7 } as const;

  expect(parseSnapshotTags(formatSnapshotTags(values))).toStrictEqual(values);
});

test('it formats the tags in order', () => {
  const tags = formatSnapshotTags({
    set: 18,
    kind: 'scheduled',
    publish: 42,
    legacySet: 17,
    provenFrom: 7,
  });

  expect(tags).toStrictEqual([
    'set-18',
    'kind-scheduled',
    'publish-42',
    'legacy-set-17',
    'proven-from-7',
  ]);
});

test('it leaves out each null tag', () => {
  const tags = formatSnapshotTags({
    set: 1,
    kind: 'scheduled',
    publish: 1,
    legacySet: null,
    provenFrom: null,
  });

  expect(tags).toStrictEqual(['set-1', 'kind-scheduled', 'publish-1']);
});
