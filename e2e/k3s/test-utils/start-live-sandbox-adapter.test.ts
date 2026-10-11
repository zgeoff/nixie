import { expect, onTestFinished, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { startLiveSandboxAdapter } from './start-live-sandbox-adapter';

test('it records sandboxes in a database of its own, which lists none at the start', async () => {
  const started = await startLiveSandboxAdapter({
    url: 'http://127.0.0.1:9',
    token: 'impd-token',
    publicEgress: null,
  });

  const sandboxes = await started.adapter.list('live-check');

  expect(sandboxes).toStrictEqual([]);
  expect(existsSync(join(started.dataDir, 'nixie.db'))).toBeTrue();
});

test('it removes its scratch directory when the test ends', async () => {
  const started = await startLiveSandboxAdapter({
    url: 'http://127.0.0.1:9',
    token: 'impd-token',
    publicEgress: null,
  });

  onTestFinished(() => {
    expect(existsSync(started.dataDir)).toBeFalse();
  });
});
