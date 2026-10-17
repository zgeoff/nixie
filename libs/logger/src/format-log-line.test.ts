import { expect, test } from 'bun:test';
import { formatLogLine } from './format-log-line';

test('it writes one JSON line with the time and the event first', () => {
  expect(
    formatLogLine({
      category: ['nixie'],
      level: 'info',
      message: ['step.committed'],
      rawMessage: 'step.committed',
      timestamp: Date.UTC(2026, 9, 11, 12, 0, 0),
      properties: { taskID: 'conversation', records: 3, isRetry: false, retryAt: null },
    }),
  ).toBe(
    '{"time":"2026-10-11T12:00:00.000Z","event":"step.committed","taskID":"conversation","records":3,"isRetry":false,"retryAt":null}\n',
  );
});

test('it writes an info event with no level, as before nixie had levels', () => {
  expect(
    formatLogLine({
      category: ['nixie'],
      level: 'info',
      message: ['http.listening'],
      rawMessage: 'http.listening',
      timestamp: Date.UTC(2026, 9, 11, 12, 0, 0),
      properties: { port: 8080 },
    }),
  ).toBe('{"time":"2026-10-11T12:00:00.000Z","event":"http.listening","port":8080}\n');
});

test.each([
  ['debug', 'debug'],
  ['warning', 'warn'],
  ['error', 'error'],
  ['trace', 'debug'],
  ['fatal', 'error'],
] as const)('it names a %s event at level %s, after the event', (level, name) => {
  expect(
    formatLogLine({
      category: ['nixie'],
      level,
      message: ['definitions.probed'],
      rawMessage: 'definitions.probed',
      timestamp: Date.UTC(2026, 9, 11, 12, 0, 0),
      properties: { changed: false },
    }),
  ).toBe(
    `{"time":"2026-10-11T12:00:00.000Z","event":"definitions.probed","level":"${name}","changed":false}\n`,
  );
});

test('it never lets a field named level replace the level', () => {
  expect(
    formatLogLine({
      category: ['nixie'],
      level: 'error',
      message: ['runner.failed'],
      rawMessage: 'runner.failed',
      timestamp: Date.UTC(2026, 9, 11, 12, 0, 0),
      properties: { level: 'debug', error: 'RangeError' },
    }),
  ).toBe(
    '{"time":"2026-10-11T12:00:00.000Z","event":"runner.failed","level":"error","error":"RangeError"}\n',
  );
});

test('it drops a field named level from an info event', () => {
  expect(
    formatLogLine({
      category: ['nixie'],
      level: 'info',
      message: ['ready'],
      rawMessage: 'ready',
      timestamp: Date.UTC(2026, 9, 11, 12, 0, 0),
      properties: { level: 'error' },
    }),
  ).toBe('{"time":"2026-10-11T12:00:00.000Z","event":"ready"}\n');
});

test('it never lets a field replace the time or the event', () => {
  expect(
    formatLogLine({
      category: ['nixie'],
      level: 'info',
      message: ['ready'],
      rawMessage: 'ready',
      timestamp: Date.UTC(2026, 9, 11, 12, 0, 0),
      properties: { event: 'other', time: 'never' },
    }),
  ).toBe('{"time":"2026-10-11T12:00:00.000Z","event":"ready"}\n');
});

test("it writes no field that holds an object or a list, such as a message's text or a tool's result", () => {
  expect(
    formatLogLine({
      category: ['nixie'],
      level: 'info',
      message: ['turn.ended'],
      rawMessage: 'turn.ended',
      timestamp: Date.UTC(2026, 9, 11, 12, 0, 0),
      properties: {
        taskID: 'conversation',
        content: [{ type: 'text', text: 'Is the ferry running on Sunday?' }],
        toolResult: { output: 'The Sunday ferry leaves at nine.' },
      },
    }),
  ).toBe('{"time":"2026-10-11T12:00:00.000Z","event":"turn.ended","taskID":"conversation"}\n');
});
