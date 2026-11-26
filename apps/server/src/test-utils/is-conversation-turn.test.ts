import { expect, test } from 'bun:test';
import { isConversationTurn } from './is-conversation-turn';

test.each([
  {
    name: 'a request that offers the task start tool',
    tools: ['mcp__nixie__task_start'],
    isTurn: true,
  },
  { name: 'a request that offers other tools', tools: ['mcp__nixie__time_now'], isTurn: false },
  { name: 'a request that offers no tool', tools: [], isTurn: false },
])('#isConversationTurn reads $name', (row) => {
  const body = { tools: row.tools.map((name) => ({ name })) };

  expect(isConversationTurn(body)).toBe(row.isTurn);
});
