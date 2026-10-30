import { expect, test } from 'bun:test';
import { buildReleaseNoteComparisons } from './build-release-note-comparisons.ts';

test('it compares both checks with the last release', () => {
  expect(
    buildReleaseNoteComparisons({
      tag: 'v0.58.0',
      hasConfigSchema: true,
      releasedSchemaPath: '/runner/released.json',
      releasedConfigPath: '/runner/released-config.schema.json',
    }),
  ).toStrictEqual({
    migrations: ['--released', '/runner/released.json', '--last-tag', 'v0.58.0'],
    configSchema: ['--released', '/runner/released-config.schema.json', '--last-tag', 'v0.58.0'],
  });
});

test('it compares nothing before the first release', () => {
  expect(
    buildReleaseNoteComparisons({
      tag: '',
      hasConfigSchema: false,
      releasedSchemaPath: '/runner/released.json',
      releasedConfigPath: '/runner/released-config.schema.json',
    }),
  ).toStrictEqual({ migrations: [], configSchema: [] });
});

test('it compares only the migrations when the last release commits no config schema', () => {
  expect(
    buildReleaseNoteComparisons({
      tag: 'v0.20.0',
      hasConfigSchema: false,
      releasedSchemaPath: '/runner/released.json',
      releasedConfigPath: '/runner/released-config.schema.json',
    }),
  ).toStrictEqual({
    migrations: ['--released', '/runner/released.json', '--last-tag', 'v0.20.0'],
    configSchema: [],
  });
});
