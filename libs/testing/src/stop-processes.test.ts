import { expect, onTestFinished, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { stopProcesses } from './stop-processes';
import { waitForCondition } from './wait-for-condition';

test('it kills a process and every member of the group it leads', async () => {
  const leader = Bun.spawn(['sh', '-c', 'sleep 60 & echo $!; wait'], {
    detached: true,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'ignore',
  });

  onTestFinished(() => {
    leader.kill('SIGKILL');
  });

  const reader = leader.stdout.getReader();
  const firstChunk = await reader.read();
  const memberPID = Number(new TextDecoder().decode(firstChunk.value).trim());

  reader.releaseLock();
  stopProcesses([leader.pid]);
  await leader.exited;

  // the killed member stays a zombie until init reaps it
  await waitForCondition(
    () =>
      !existsSync(`/proc/${memberPID}`) ||
      readFileSync(`/proc/${memberPID}/stat`, 'utf8').includes(') Z '),
  );

  expect(leader.signalCode).toBe('SIGKILL');
});

test('it skips a process that is already gone', async () => {
  const gone = Bun.spawn(['true']);

  await gone.exited;

  expect(() => {
    stopProcesses([gone.pid]);
  }).not.toThrow();
});
