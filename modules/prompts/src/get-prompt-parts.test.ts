import { expect, test } from 'bun:test';
import { getPromptParts } from './get-prompt-parts';

test('it gives the parts of a prompt in the order they render', () => {
  expect(getPromptParts('consolidator')).toStrictEqual([
    'persona',
    'nameRule',
    'instruction',
    'safety',
  ]);
});
