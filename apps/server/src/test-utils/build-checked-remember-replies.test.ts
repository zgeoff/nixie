import { expect, test } from 'bun:test';
import { buildCheckedRememberReplies } from './build-checked-remember-replies';

test('it builds a remember call and an asserted verdict for each quote, in order', () => {
  expect(
    buildCheckedRememberReplies(['the cat eats at six', 'the bins go out on Tuesday']),
  ).toStrictEqual([
    {
      toolUse: {
        name: 'mcp__nixie__memory_remember',
        input: { text: 'the cat eats at six', quote: 'the cat eats at six' },
      },
    },
    { toolUse: { name: 'StructuredOutput', input: { verdict: 'asserted', reason: 'Stated.' } } },
    {
      toolUse: {
        name: 'mcp__nixie__memory_remember',
        input: { text: 'the bins go out on Tuesday', quote: 'the bins go out on Tuesday' },
      },
    },
    { toolUse: { name: 'StructuredOutput', input: { verdict: 'asserted', reason: 'Stated.' } } },
  ]);
});

test('it builds no replies for no quotes', () => {
  expect(buildCheckedRememberReplies([])).toStrictEqual([]);
});
