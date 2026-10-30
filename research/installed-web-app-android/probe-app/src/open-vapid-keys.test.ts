import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openVapidKeys } from './open-vapid-keys.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'probe-vapid-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it writes a key pair on the first start and reads the same pair on the next', async () => {
  const ctx = await setupTest();

  const first = await openVapidKeys(join(ctx.directory, '.vapid'));
  const second = await openVapidKeys(join(ctx.directory, '.vapid'));

  expect(second.publicKey).toBe(first.publicKey);
  expect(Buffer.from(first.publicKey, 'base64url')).toHaveLength(65);
  expect((await stat(join(ctx.directory, '.vapid', 'keys.json'))).mode & 0o777).toBe(0o600);
});

test('it gives 4 first starts at once the same key pair and leaves no draft', async () => {
  const ctx = await setupTest();

  const starts = await Promise.all(
    Array.from({ length: 4 }, () => openVapidKeys(join(ctx.directory, '.vapid'))),
  );

  expect(new Set(starts.map((keys) => keys.publicKey)).size).toBe(1);
  expect(await readdir(join(ctx.directory, '.vapid'))).toStrictEqual(['keys.json']);
});
