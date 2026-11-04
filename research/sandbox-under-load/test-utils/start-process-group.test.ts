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

async function setupTest() {
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

  // each wait stays under half of Bun's 5000 ms test timeout, so a slow wait fails with its own
  // error rather than with the test's timeout
  await waitForCondition(() => readDescendants(leaderPID).length > 0, { timeoutMs: 2000 });

  const [memberPID] = readDescendants(leaderPID);

  return { holder, leaderPID, memberPID: Number(memberPID) };
}

test('it stops the leader and the child the leader started', async () => {
  const ctx = await setupTest();

  ctx.holder.child.kill('SIGUSR1');

  await waitForCondition(
    () => probeProcessGone(ctx.leaderPID) && probeProcessGone(ctx.memberPID),
    { timeoutMs: 2000 },
  );

  expect(await ctx.holder.child.exited).toBe(0);
});

test.each([['SIGINT'], ['SIGTERM']] as const)(
  'it stops each live group when the process that started it gets %s',
  async (signal) => {
    const ctx = await setupTest();

    ctx.holder.child.kill(signal);

    await ctx.holder.child.exited;
    await waitForCondition(
      () => probeProcessGone(ctx.leaderPID) && probeProcessGone(ctx.memberPID),
      { timeoutMs: 2000 },
    );

    expect(ctx.holder.child.signalCode).toBe(signal);
  },
);

test('it stops the leader when the process that started it gets SIGKILL', async () => {
  const ctx = await setupTest();

  ctx.holder.child.kill('SIGKILL');

  await ctx.holder.child.exited;
  await waitForCondition(() => probeProcessGone(ctx.leaderPID), { timeoutMs: 2000 });

  expect(ctx.holder.child.signalCode).toBe('SIGKILL');
});
