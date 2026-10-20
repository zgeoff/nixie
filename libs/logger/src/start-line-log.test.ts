import { expect, onTestFinished, test } from 'bun:test';
import { getLogger } from '@logtape/logtape';
import { makeLogger } from './make-logger';
import { startLineLog } from './start-line-log';

test('it writes the line before the log call returns, in order with what the process prints', async () => {
  const output: string[] = [];

  const lineLog = await startLineLog((line) => {
    output.push(line);
  });

  onTestFinished(lineLog.stop);
  makeLogger()('command.failed', { command: 'memory-show' }, 'error');

  output.push('{"ok":false}\n');

  expect(output.map((text): unknown => JSON.parse(text))).toMatchObject([
    { event: 'command.failed', level: 'error', command: 'memory-show' },
    { ok: false },
  ]);
});

test("it writes no event outside nixie's category", async () => {
  const lines: string[] = [];

  const lineLog = await startLineLog((line) => {
    lines.push(line);
  });

  onTestFinished(lineLog.stop);
  getLogger(['other-library']).error('connection.lost', { host: 'example.test' });

  expect(lines).toStrictEqual([]);
});

test('it writes no line once the log stops', async () => {
  const lines: string[] = [];

  const lineLog = await startLineLog((line) => {
    lines.push(line);
  });

  await lineLog.stop();

  makeLogger()('writer.started', { epoch: 4 });

  expect(lines).toStrictEqual([]);
});
