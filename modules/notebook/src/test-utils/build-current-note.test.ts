import { expect, test } from 'bun:test';
import { buildCurrentNote } from './build-current-note';

test('it builds a note at version 2 that takes overrides', () => {
  expect(buildCurrentNote({ version: 5 })).toMatchObject({ version: 5, isPrivate: false });
});
