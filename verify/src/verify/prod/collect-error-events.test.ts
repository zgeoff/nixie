import { expect, test } from 'bun:test';
import { collectErrorEvents } from './collect-error-events';

test('it collects the event of each error line', () => {
  const logText = [
    '{"time":"2026-11-15T01:00:00.000Z","event":"server.started"}',
    '{"time":"2026-11-15T01:00:01.000Z","event":"turn.failed","level":"error","cause":"overloaded"}',
    '{"time":"2026-11-15T01:00:02.000Z","event":"fetch.slow","level":"warn"}',
    '',
  ].join('\n');

  expect(collectErrorEvents(logText)).toStrictEqual(['turn.failed']);
});

test('it counts a line that is no log object as an error', () => {
  expect(collectErrorEvents('TypeError: undefined is not a function\n')).toStrictEqual([
    'unparsed line',
  ]);
});

test('it collects nothing from a log with no error line', () => {
  expect(
    collectErrorEvents('{"time":"2026-11-15T01:00:00.000Z","event":"server.started"}\n'),
  ).toStrictEqual([]);
});
