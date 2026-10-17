import { expect, onTestFinished, setSystemTime, test } from 'bun:test';
import { makeLogger } from './make-logger';
import { startLineLog } from './start-line-log';

// LogTape configured to write each line into lines, on a clock held at noon
async function setupTest() {
  const lines: string[] = [];

  setSystemTime(Date.UTC(2026, 9, 11, 12, 0, 0));

  onTestFinished(() => {
    setSystemTime();
  });

  const lineLog = await startLineLog((line) => {
    lines.push(line);
  });

  onTestFinished(lineLog.stop);

  return { lines };
}

test('it writes one JSON line through LogTape with the time and the event first', async () => {
  const ctx = await setupTest();

  makeLogger()('step.committed', { taskID: 'conversation', records: 3, isRetry: false });

  expect(ctx.lines).toStrictEqual([
    '{"time":"2026-10-11T12:00:00.000Z","event":"step.committed","taskID":"conversation","records":3,"isRetry":false}\n',
  ]);
});

test('it writes a call that names no level as an info line, with no level', async () => {
  const ctx = await setupTest();

  makeLogger()('writer.started');

  expect(ctx.lines).toStrictEqual([
    '{"time":"2026-10-11T12:00:00.000Z","event":"writer.started"}\n',
  ]);
});

test.each(['debug', 'warn', 'error'] as const)(
  'it writes a %s event with its level',
  async (level) => {
    const ctx = await setupTest();

    makeLogger()('start.retry', { attempt: 2 }, level);

    expect(ctx.lines).toStrictEqual([
      `{"time":"2026-10-11T12:00:00.000Z","event":"start.retry","level":"${level}","attempt":2}\n`,
    ]);
  },
);

test('it never lets a field named level replace the level of the call', async () => {
  const ctx = await setupTest();

  makeLogger()('runner.failed', { level: 'debug' }, 'error');

  expect(ctx.lines).toStrictEqual([
    '{"time":"2026-10-11T12:00:00.000Z","event":"runner.failed","level":"error"}\n',
  ]);
});

test('it writes the event as it came, even with a brace in it', async () => {
  const ctx = await setupTest();

  makeLogger()('probe.{name}', { name: 'health' });

  expect(ctx.lines).toStrictEqual([
    '{"time":"2026-10-11T12:00:00.000Z","event":"probe.{name}","name":"health"}\n',
  ]);
});
