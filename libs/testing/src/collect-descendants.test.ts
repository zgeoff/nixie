import { expect, onTestFinished, test } from 'bun:test';
import { collectDescendants } from './collect-descendants';
import { stopProcesses } from './stop-processes';

test('it collects the children of a process and their children', async () => {
  const child = Bun.spawn(['sh', '-c', 'sleep 60 & echo $!; wait'], {
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'ignore',
  });

  onTestFinished(() => {
    child.kill('SIGKILL');
  });

  const reader = child.stdout.getReader();
  const firstChunk = await reader.read();
  const grandchildPID = Number(new TextDecoder().decode(firstChunk.value).trim());

  onTestFinished(() => {
    stopProcesses([grandchildPID]);
  });
  reader.releaseLock();

  const descendants = collectDescendants(process.pid);

  expect(descendants).toIncludeAllMembers([child.pid, grandchildPID]);
});

test('it collects nothing below a process with no children', () => {
  const child = Bun.spawn(['sleep', '60'], { stdin: 'ignore', stdout: 'ignore', stderr: 'ignore' });

  onTestFinished(() => {
    child.kill('SIGKILL');
  });

  expect(collectDescendants(child.pid)).toStrictEqual([]);
});
