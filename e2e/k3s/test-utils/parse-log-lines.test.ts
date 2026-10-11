import { expect, test } from 'bun:test';
import { parseLogLines } from './parse-log-lines';

test('it parses each JSON log line with its time, event and fields', () => {
  expect(
    parseLogLines(
      [
        '{"time":"2026-10-11T15:57:39.108Z","event":"writer.started","epoch":1}',
        '{"time":"2026-10-11T15:59:09.083Z","event":"stopped"}',
        '',
      ].join('\n'),
    ),
  ).toStrictEqual([
    {
      time: new Date('2026-10-11T15:57:39.108Z'),
      event: 'writer.started',
      fields: { time: '2026-10-11T15:57:39.108Z', event: 'writer.started', epoch: 1 },
    },
    {
      time: new Date('2026-10-11T15:59:09.083Z'),
      event: 'stopped',
      fields: { time: '2026-10-11T15:59:09.083Z', event: 'stopped' },
    },
  ]);
});

test('it skips lines that are not nixie log lines', () => {
  expect(
    parseLogLines(
      [
        'rpc error: code = NotFound desc = an error occurred when try to find container',
        '[1,2]',
        '{"event":"stopped"}',
        '{"time":"not a time","event":"stopped"}',
        '{"time":"2026-10-11T15:59:09.083Z","event":7}',
      ].join('\n'),
    ),
  ).toStrictEqual([]);
});
