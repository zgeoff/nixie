import { expect, test } from 'bun:test';
import { harnessIDs } from '@heynixie/wire';
import { harnesses } from './bind-harness';

test('it holds a definition for each harness ID, and no other', () => {
  expect(harnesses.map((definition) => definition.id).toSorted()).toStrictEqual(
    [...harnessIDs].toSorted(),
  );
});
