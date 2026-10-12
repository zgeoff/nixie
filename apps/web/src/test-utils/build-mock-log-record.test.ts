import { expect, test } from 'bun:test';
import { buildMockLogRecord } from './build-mock-log-record';

test('it builds a default log record', () => {
  expect(buildMockLogRecord()).toStrictEqual({
    kind: 'model.turn_ended',
    recordedAt: expect.toBeValidDate(),
    sequence: expect.toBeWithin(1, 1_000_001),
    thread: expect.any(String),
  });
});

test('it applies overrides on top of the defaults', () => {
  expect(
    buildMockLogRecord({
      kind: 'tool_called',
      sequence: 4,
      toolCall: { callID: 'call-1', tool: 'web_fetch' },
    }),
  ).toStrictEqual({
    kind: 'tool_called',
    recordedAt: expect.toBeValidDate(),
    sequence: 4,
    thread: expect.any(String),
    toolCall: { callID: 'call-1', tool: 'web_fetch' },
  });
});
