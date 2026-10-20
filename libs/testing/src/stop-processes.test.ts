import { expect, onTestFinished, test } from 'bun:test';
import { readDescendants } from './read-descendants';
import { stopProcesses } from './stop-processes';
import { probeProcessGone } from './test-utils/probe-process-gone';
import { waitForCondition } from './wait-for-condition';

test('it kills a process and every member of the group it leads', async () => {
  const leader = Bun.spawn(['sh', '-c', 'sleep 60 & wait'], {
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore'],
  });

  onTestFinished(() => {
    stopProcesses([leader.pid]);
  });

  await waitForCondition(() => readDescendants(leader.pid).length > 0);

  const [memberPID] = readDescendants(leader.pid);

  stopProcesses([leader.pid]);

  await leader.exited;
  await waitForCondition(() => probeProcessGone(Number(memberPID))).catch(() => null);

  expect(leader.signalCode).toBe('SIGKILL');
  expect(probeProcessGone(Number(memberPID))).toBe(true);
});

test('it skips a process that is already gone', async () => {
  const gone = Bun.spawn(['true']);

  await gone.exited;

  expect(() => {
    stopProcesses([gone.pid]);
  }).not.toThrow();
});
