import { expect, onTestFinished, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { readDescendants } from './read-descendants';
import { stopProcesses } from './stop-processes';
import { waitForCondition } from './wait-for-condition';

test('it reads the children of a process and their children', async () => {
  const child = Bun.spawn(['sh', '-c', 'sleep 60 & wait'], {
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore'],
  });

  onTestFinished(() => {
    stopProcesses([child.pid]);
  });

  await waitForCondition(() => readDescendants(child.pid).length > 0);

  const [grandchild] = readDescendants(child.pid);
  const grandchildStat = readFileSync(`/proc/${grandchild}/stat`, 'utf8');
  const descendants = readDescendants(process.pid);

  expect(grandchildStat).toInclude('(sleep)');
  expect(descendants).toIncludeAllMembers([child.pid, grandchild]);
});

test('it reads nothing below a process with no children', () => {
  const child = Bun.spawn(['sleep', '60'], { stdin: 'ignore', stdout: 'ignore', stderr: 'ignore' });

  onTestFinished(() => {
    child.kill('SIGKILL');
  });

  expect(readDescendants(child.pid)).toStrictEqual([]);
});
