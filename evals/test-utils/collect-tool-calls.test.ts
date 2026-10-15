import { expect, test } from 'bun:test';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { collectToolCalls } from './collect-tool-calls';

test('it pairs each tool call with the result the model read, in order', () => {
  const messages = [
    {
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: 'Running both.' },
          { type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command: 'echo first' } },
          { type: 'tool_use', id: 'toolu_2', name: 'Bash', input: { command: 'echo second' } },
        ],
      },
    },
    {
      type: 'user',
      message: {
        content: [
          { type: 'tool_result', tool_use_id: 'toolu_2', is_error: true, content: 'denied' },
          {
            type: 'tool_result',
            tool_use_id: 'toolu_1',
            content: [
              { type: 'text', text: 'first' },
              { type: 'image', source: {} },
              { type: 'text', text: 'done' },
            ],
          },
        ],
      },
    },
  ] as unknown as SDKMessage[];

  expect(collectToolCalls(messages)).toStrictEqual([
    {
      name: 'Bash',
      input: { command: 'echo first' },
      result: { isError: false, text: 'first\ndone' },
    },
    { name: 'Bash', input: { command: 'echo second' }, result: { isError: true, text: 'denied' } },
  ]);
});

test('it keeps a call with no result as unanswered', () => {
  const messages = [
    {
      type: 'assistant',
      message: {
        content: [{ type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command: 'sleep 9' } }],
      },
    },
    { type: 'user', message: { content: 'a typed prompt' } },
  ] as unknown as SDKMessage[];

  expect(collectToolCalls(messages)).toStrictEqual([
    { name: 'Bash', input: { command: 'sleep 9' }, result: null },
  ]);
});
