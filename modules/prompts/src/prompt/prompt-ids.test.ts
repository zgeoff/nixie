import { expect, test } from 'bun:test';
import { promptIDs } from './prompt-ids';
import { promptRegistry } from './prompt-registry';

test('it lists every prompt in the registry', () => {
  expect(promptIDs).toIncludeSameMembers(Object.keys(promptRegistry));
});
