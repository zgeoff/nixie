import { expect, test } from 'bun:test';
import { makeLogger } from './make-logger';

test('it writes one JSON line with the time and the event first', () => {
  const lines: string[] = [];
  const log = makeLogger(
    (line) => {
      lines.push(line);
    },
    () => Date.UTC(2026, 9, 11, 12, 0, 0),
  );

  log('step.committed', { taskID: 'conversation', records: 3, isRetry: false });

  expect(lines).toSatisfyAll(
    (line: string) =>
      line.startsWith('{"time":"2026-10-11T12:00:00.000Z","event":"step.committed",') &&
      line.endsWith('}\n'),
  );
  expect(lines.map((line) => JSON.parse(line) as unknown)).toMatchObject([
    {
      time: '2026-10-11T12:00:00.000Z',
      event: 'step.committed',
      taskID: 'conversation',
      records: 3,
      isRetry: false,
    },
  ]);
});

test('it never lets a field replace the time or the event', () => {
  const lines: string[] = [];
  const log = makeLogger(
    (line) => {
      lines.push(line);
    },
    () => Date.UTC(2026, 9, 11, 12, 0, 0),
  );

  log('ready', { event: 'other', time: 'never' });

  expect(lines.map((line) => JSON.parse(line) as unknown)).toStrictEqual([
    { time: '2026-10-11T12:00:00.000Z', event: 'ready' },
  ]);
});
