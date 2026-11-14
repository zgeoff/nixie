import { expect, test } from 'bun:test';
import { buildMigrationSummary } from './build-migration-summary';

test('it lists each added migration and whether the last release reads its schema', () => {
  expect(
    buildMigrationSummary(
      {
        changed: [],
        changedObjects: [],
        added: [
          { version: 7, name: 'add the moments table', refused: [] },
          { version: 8, name: 'add a title to moments', refused: ['DROP TABLE notes'] },
        ],
        readableByReleaseBefore: false,
      },
      'v0.3.0',
    ),
  ).toStrictEqual({
    since: 'v0.3.0',
    added: [
      { version: 7, name: 'add the moments table' },
      { version: 8, name: 'add a title to moments' },
    ],
    readableByReleaseBefore: false,
  });
});

test('it leaves readability unset for the first release', () => {
  expect(
    buildMigrationSummary(
      {
        changed: [],
        changedObjects: [],
        added: [{ version: 1, name: 'create the event log', refused: [] }],
        readableByReleaseBefore: true,
      },
      null,
    ),
  ).toStrictEqual({
    since: null,
    added: [{ version: 1, name: 'create the event log' }],
    readableByReleaseBefore: null,
  });
});
