import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildLoginFile } from '../test-utils/build-login-file';
import { changeLoginFile } from './change-login-file';
import { readLoginFile } from './read-login-file';
import { withLoginLock } from './with-login-lock';
import { writeLoginFile } from './write-login-file';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'model-gateway-login-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory, path: join(directory, 'logins', 'plan.json') };
}

test('it reads a login file that is gone as null', async () => {
  const ctx = await setupTest();
  const result = await readLoginFile(ctx.path);

  expect(result).toBeNull();
});

test('it writes a change to the login the caller read', async () => {
  const ctx = await setupTest();

  await writeLoginFile(ctx.path, buildLoginFile());

  const result = await changeLoginFile(ctx.path, 'login-1', (held) => ({
    ...held,
    refreshToken: 'refresh-token-2',
  }));

  expect(result).toBe('written');

  const held = await readLoginFile(ctx.path);

  expect(held?.refreshToken).toBe('refresh-token-2');
});

test('it writes nothing over a newer login', async () => {
  const ctx = await setupTest();

  await writeLoginFile(ctx.path, buildLoginFile({ loginID: 'login-2' }));

  const result = await changeLoginFile(ctx.path, 'login-1', (held) => ({
    ...held,
    refreshToken: 'refresh-token-2',
  }));

  expect(result).toBe('replaced');

  const held = await readLoginFile(ctx.path);

  expect(held?.refreshToken).toBe('refresh-token-1');
});

test('it reports a login file that is gone as missing', async () => {
  const ctx = await setupTest();
  const result = await changeLoginFile(ctx.path, 'login-1', (held) => held);

  expect(result).toBe('missing');
});

test('it runs a second holder of one file after the first lets go', async () => {
  const ctx = await setupTest();

  const order: string[] = [];
  const entered = Promise.withResolvers<undefined>();
  const release = Promise.withResolvers<undefined>();

  const first = withLoginLock(ctx.path, async () => {
    order.push('first in');
    entered.resolve(undefined);

    await release.promise;

    order.push('first out');
  });

  await entered.promise;

  const second = withLoginLock(ctx.path, () => {
    order.push('second in');

    return Promise.resolve();
  });

  release.resolve(undefined);

  await Promise.all([first, second]);

  expect(order).toStrictEqual(['first in', 'first out', 'second in']);
});

test('it gives up on a lock that another holder keeps, and says so', async () => {
  const ctx = await setupTest();

  const entered = Promise.withResolvers<undefined>();
  const release = Promise.withResolvers<undefined>();

  const holder = withLoginLock(ctx.path, () => {
    entered.resolve(undefined);

    return release.promise;
  });

  await entered.promise;

  const waiter = withLoginLock(ctx.path, () => Promise.resolve(), 50);

  expect(waiter).rejects.toThrow(/stayed locked/u);

  release.resolve(undefined);

  await holder;
});

test('it takes a lock again after a holder ends', async () => {
  const ctx = await setupTest();

  await withLoginLock(ctx.path, () => Promise.resolve());

  const result = await withLoginLock(ctx.path, () => Promise.resolve('again'));

  expect(result).toBe('again');
});
