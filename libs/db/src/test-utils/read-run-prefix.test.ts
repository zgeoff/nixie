import { expect, test } from 'bun:test';
import { readRunPrefix } from './read-run-prefix';

test('it names the test process by its PID and its PID namespace', async () => {
  const prefix = await readRunPrefix();

  expect(prefix).toMatch(new RegExp(`^pid${String(process.pid)}-ns\\d+-$`, 'u'));
});
