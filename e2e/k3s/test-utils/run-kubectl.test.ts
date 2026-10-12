import { expect, onTestFinished, test } from 'bun:test';
import { join } from 'node:path';
import { runKubectl } from './run-kubectl';

function setupTest() {
  return { stub: join(import.meta.dir, 'run-stub-kubectl.ts') };
}

test('it runs the command with the kubeconfig and namespace first and returns its stdout', async () => {
  const ctx = setupTest();

  const stdout = await runKubectl(
    { argv: [process.execPath, ctx.stub], kubeconfig: '/tmp/kubeconfig', namespace: 'nixie' },
    ['get', 'pods'],
  );

  expect(JSON.parse(stdout)).toStrictEqual([
    '--kubeconfig',
    '/tmp/kubeconfig',
    '--namespace',
    'nixie',
    'get',
    'pods',
  ]);
});

test('it throws with the stderr of a command that exits non-zero', () => {
  const ctx = setupTest();

  expect(
    runKubectl(
      { argv: [process.execPath, ctx.stub], kubeconfig: '/tmp/kubeconfig', namespace: 'nixie' },
      ['get', 'fail'],
    ),
  ).rejects.toThrowWithMessage(Error, 'kubectl get fail exited 1: error: the server refused');
});

test('it kills a command still running when the test finishes', () => {
  const ctx = setupTest();

  const run = runKubectl(
    { argv: [process.execPath, ctx.stub], kubeconfig: '/tmp/kubeconfig', namespace: 'nixie' },
    ['get', 'hang'],
  );

  // registered after the call, so it runs once the helper's kill has
  onTestFinished(async () => {
    await expect(run).toReject();
  });
});
