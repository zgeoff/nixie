import { expect, onTestFinished, test } from 'bun:test';
import { join } from 'node:path';
import { waitForCondition } from '../../../libs/testing/src/index';
import { startKubectl } from './start-kubectl';

function setupTest() {
  return { stub: join(import.meta.dir, 'run-stub-kubectl.ts') };
}

test('it gathers each line the command prints until the command ends', async () => {
  const ctx = setupTest();

  const stream = startKubectl(
    { argv: [process.execPath, ctx.stub], kubeconfig: '/tmp/kubeconfig', namespace: 'nixie' },
    ['logs', '--follow', 'stream'],
  );
  const code = await stream.exited;

  expect(code).toBe(0);
  expect(stream.lines).toStrictEqual([
    '["--kubeconfig","/tmp/kubeconfig","--namespace","nixie","logs","--follow","stream"]',
    'line 1',
    'line 2',
    'line 3',
  ]);
});

test('it ends a command that keeps running when stopped, and keeps the lines it gathered', async () => {
  const ctx = setupTest();
  const stream = startKubectl(
    { argv: [process.execPath, ctx.stub], kubeconfig: '/tmp/kubeconfig', namespace: 'nixie' },
    ['get', '--watch', 'hang'],
  );

  onTestFinished(() => stream.stop());
  await waitForCondition(() => stream.lines.length === 1);

  const code = await stream.stop();

  expect(code).not.toBe(0);
  expect(stream.lines).toStrictEqual([
    '["--kubeconfig","/tmp/kubeconfig","--namespace","nixie","get","--watch","hang"]',
  ]);
});
