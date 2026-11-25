import { expect, test } from 'bun:test';
import type { RuleSource } from '@heynixie/policy';
import { takeSources } from './take-sources';

test('#takeSources adds a source to the list in place, sorted and with no repeat', () => {
  const held: RuleSource[] = ['owner'];

  takeSources(held, ['outside', 'owner']);

  expect(held).toStrictEqual(['outside', 'owner']);
});
