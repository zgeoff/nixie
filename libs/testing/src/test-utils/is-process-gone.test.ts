import { expect, onTestFinished, test } from 'bun:test';
import { isProcessGone } from './is-process-gone';

test('it reports a running process as not gone', () => {
  const child = Bun.spawn(['sleep', '60'], { stdio: ['ignore', 'ignore', 'ignore'] });

  onTestFinished(() => {
    child.kill('SIGKILL');
  });

  expect(isProcessGone(child.pid)).toBe(false);
});

test('it reports a process that exited and was reaped as gone', async () => {
  const child = Bun.spawn(['true']);

  await child.exited;

  expect(isProcessGone(child.pid)).toBe(true);
});
