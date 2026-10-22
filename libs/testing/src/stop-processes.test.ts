import { expect, onTestFinished, test } from 'bun:test';
import { probeProcessGone } from './probe-process-gone';
import { readDescendants } from './read-descendants';
import { stopProcesses } from './stop-processes';
import { waitForCondition } from './wait-for-condition';

test('it kills a process and every member of the group it leads', async () => {
  const leader = Bun.spawn(['sh', '-c', 'sleep 60 & wait'], {
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore'],
  });

  onTestFinished(() => {
    stopProcesses([leader.pid]);
  });

  // each bound stays under half of Bun's 5000 ms test timeout, so a slow wait fails with its own
  // error rather than with the test's timeout
  await waitForCondition(() => readDescendants(leader.pid).length > 0, { timeoutMs: 2000 });

  const [memberPID] = readDescendants(leader.pid);

  stopProcesses([leader.pid]);

  await leader.exited;
  await waitForCondition(() => probeProcessGone(Number(memberPID)), { timeoutMs: 2000 });

  expect(leader.signalCode).toBe('SIGKILL');
});

test('it skips a process that is already gone', async () => {
  const gone = Bun.spawn(['true']);

  await gone.exited;

  expect(() => {
    stopProcesses([gone.pid]);
  }).not.toThrow();
});
