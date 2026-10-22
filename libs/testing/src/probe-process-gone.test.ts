import { expect, onTestFinished, test } from 'bun:test';
import { probeProcessGone } from './probe-process-gone';

test('it reports a running process as not gone', () => {
  const child = Bun.spawn(['sleep', '60'], { stdio: ['ignore', 'ignore', 'ignore'] });

  onTestFinished(() => {
    child.kill('SIGKILL');
  });

  expect(probeProcessGone(child.pid)).toBe(false);
});

test('it reports a process that exited and was reaped as gone', async () => {
  const child = Bun.spawn(['true']);

  await child.exited;

  expect(probeProcessGone(child.pid)).toBe(true);
});
