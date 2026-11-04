import { join } from 'node:path';
import { expect, onTestFinished, test } from 'bun:test';
// @boundaries-ignore a spike imports the repo's process helpers by path
import { probeProcessGone } from '../../../libs/testing/src/probe-process-gone';
// @boundaries-ignore a spike imports the repo's process helpers by path
import { readDescendants } from '../../../libs/testing/src/read-descendants';
// @boundaries-ignore a spike imports the repo's process helpers by path
import { stopProcesses } from '../../../libs/testing/src/stop-processes';
// @boundaries-ignore a spike imports the repo's condition wait by path
import { waitForCondition } from '../../../libs/testing/src/wait-for-condition';
import { startProcessGroup } from './start-process-group';

test('it stops the leader and the child the leader started', async () => {
  const group = startProcessGroup(
    ['sh', '-c', `while kill -0 ${process.pid} 2> /dev/null; do sleep 0.05; done & wait`],
    { stdout: 'ignore', stderr: 'ignore' },
  );

  onTestFinished(group.stop);

  // each bound stays under half of Bun's 5000 ms test timeout, so a slow wait fails with its own
  // error rather than with the test's timeout
  await waitForCondition(() => readDescendants(group.child.pid).length > 0, { timeoutMs: 2000 });

  const [memberPID] = readDescendants(group.child.pid);

  await group.stop();
  await waitForCondition(() => probeProcessGone(Number(memberPID)), { timeoutMs: 2000 });

  expect(group.child.signalCode).toBe('SIGKILL');
});

test.each([['SIGINT'], ['SIGTERM']] as const)(
  'it stops each live group when the process that started it gets %s',
  async (signal) => {
    const holder = startProcessGroup(['bun', join(import.meta.dir, 'hold-process-group.ts')], {
      stdout: 'pipe',
      stderr: 'ignore',
    });

    onTestFinished(holder.stop);

    const printed = await holder.child.stdout
      .pipeThrough(new TextDecoderStream())
      .getReader()
      .read();
    const leaderPID = Number(printed.value?.trim());

    onTestFinished(() => {
      stopProcesses([leaderPID]);
    });

    await waitForCondition(() => readDescendants(leaderPID).length > 0, { timeoutMs: 2000 });

    const [memberPID] = readDescendants(leaderPID);

    holder.child.kill(signal);

    await holder.child.exited;
    await waitForCondition(
      () => probeProcessGone(leaderPID) && probeProcessGone(Number(memberPID)),
      { timeoutMs: 2000 },
    );

    expect(holder.child.signalCode).toBe(signal);
  },
);

test('it stops the leader when the process that started it gets SIGKILL', async () => {
  const holder = startProcessGroup(['bun', join(import.meta.dir, 'hold-process-group.ts')], {
    stdout: 'pipe',
    stderr: 'ignore',
  });

  onTestFinished(holder.stop);

  const printed = await holder.child.stdout
    .pipeThrough(new TextDecoderStream())
    .getReader()
    .read();
  const leaderPID = Number(printed.value?.trim());

  onTestFinished(() => {
    stopProcesses([leaderPID]);
  });

  await waitForCondition(() => readDescendants(leaderPID).length > 0, { timeoutMs: 2000 });

  holder.child.kill('SIGKILL');

  await holder.child.exited;
  await waitForCondition(() => probeProcessGone(leaderPID), { timeoutMs: 2000 });

  expect(holder.child.signalCode).toBe('SIGKILL');
});
