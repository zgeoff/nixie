import { expect, test } from 'bun:test';
import { parseSessionMessage } from './parse-session-message.ts';

test('it reads a text delta of the reply', () => {
  expect(
    parseSessionMessage({
      event: { delta: { text: 'Pack a warm layer', type: 'text_delta' }, index: 0, type: 'content_block_delta' },
      parent_tool_use_id: null,
      session_id: 'session-1',
      type: 'stream_event',
      uuid: 'message-1',
    }),
  ).toStrictEqual({ kind: 'text', text: 'Pack a warm layer' });
});

test('it ignores a text delta from a subagent', () => {
  expect(
    parseSessionMessage({
      event: { delta: { text: 'Looking it up', type: 'text_delta' }, index: 0, type: 'content_block_delta' },
      parent_tool_use_id: 'tool-1',
      session_id: 'session-1',
      type: 'stream_event',
      uuid: 'message-2',
    }),
  ).toStrictEqual({ kind: 'ignored' });
});

test('it reads the tools an assistant message called', () => {
  expect(
    parseSessionMessage({
      message: {
        content: [
          { text: 'Checking.', type: 'text' },
          { id: 'tool-1', input: {}, name: 'mcp__voice__read_weather', type: 'tool_use' },
        ],
        role: 'assistant',
      },
      parent_tool_use_id: null,
      session_id: 'session-1',
      type: 'assistant',
      uuid: 'message-3',
    }),
  ).toStrictEqual({ kind: 'tool-calls', names: ['mcp__voice__read_weather'] });
});

test('it reads the result of a successful turn', () => {
  expect(
    parseSessionMessage({
      duration_ms: 1200,
      is_error: false,
      result: 'Pack a warm layer.',
      session_id: 'session-1',
      subtype: 'success',
      total_cost_usd: 0.0021,
      ttft_stream_ms: 640,
      type: 'result',
      uuid: 'message-4',
    }),
  ).toStrictEqual({
    fields: { isError: false, subtype: 'success', ttftStreamMs: 640 },
    kind: 'result',
    totalCostUSD: 0.0021,
  });
});

test('it keeps the error flag of a turn whose request failed', () => {
  expect(
    parseSessionMessage({
      duration_ms: 300,
      is_error: true,
      session_id: 'session-1',
      subtype: 'error_during_execution',
      total_cost_usd: 0,
      type: 'result',
      uuid: 'message-5',
    }),
  ).toStrictEqual({
    fields: { isError: true, subtype: 'error_during_execution', ttftStreamMs: undefined },
    kind: 'result',
    totalCostUSD: 0,
  });
});

test('it ignores a message the turn does not act on', () => {
  expect(parseSessionMessage({ session_id: 'session-1', subtype: 'init', type: 'system', uuid: 'message-6' })).toStrictEqual(
    { kind: 'ignored' },
  );
});
