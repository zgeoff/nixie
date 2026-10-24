import { expect, test } from 'bun:test';
import { collectAcceptedPaths } from './collect-accepted-paths';

test("it accepts the prompt's own paths and no part in its first part", () => {
  expect(collectAcceptedPaths('compaction', 'instruction')).toStrictEqual([
    'owner.name',
    'owner.nameAtSentenceStart',
    'summary.words',
  ]);
});

test('it accepts each earlier part in a later part', () => {
  expect(collectAcceptedPaths('session', 'safety')).toStrictEqual([
    'persona',
    'skillCatalog',
    'owner.name',
    'parts.skillCatalog',
    'parts.instruction',
  ]);
});

test('it accepts every part in the template', () => {
  expect(collectAcceptedPaths('retirement-checker', null)).toStrictEqual([
    'parts.instruction',
    'parts.safety',
  ]);
});

test('it fails on a part that the prompt does not have', () => {
  expect(() => collectAcceptedPaths('compaction', 'tone')).toThrowWithMessage(
    Error,
    'Invariant failed: the compaction prompt has no part tone',
  );
});
