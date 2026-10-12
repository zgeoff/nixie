import { expect, test } from 'bun:test';
import { buildRememberReply } from './build-remember-reply';

test('it builds a call of the memory.remember tool with its arguments', () => {
  expect(
    buildRememberReply({ text: 'You live at 4 Elm Row.', quote: '4 Elm Row', sourceID: 3 }),
  ).toStrictEqual({
    toolUse: {
      name: 'mcp__nixie__memory_remember',
      input: { text: 'You live at 4 Elm Row.', quote: '4 Elm Row', sourceID: 3 },
    },
  });
});

test('it passes the item a call revises', () => {
  expect(
    buildRememberReply({
      text: 'You live at 9 Oak Lane.',
      quote: '9 Oak Lane',
      sourceID: 4,
      itemID: 'item-a',
    }),
  ).toStrictEqual({
    toolUse: {
      name: 'mcp__nixie__memory_remember',
      input: {
        text: 'You live at 9 Oak Lane.',
        quote: '9 Oak Lane',
        sourceID: 4,
        itemID: 'item-a',
      },
    },
  });
});
