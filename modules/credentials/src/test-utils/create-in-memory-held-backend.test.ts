import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CredentialEvent, HeldToken } from '../held/types';
import { createInMemoryHeldBackend } from './create-in-memory-held-backend';

async function setupTest() {
  const written: CredentialEvent[] = [];

  const recorder = {
    write: (event: CredentialEvent) => {
      written.push(event);

      return Promise.resolve();
    },
    readOpenRefreshes: () => Promise.resolve([]),
  };

  const backend = createInMemoryHeldBackend({ recorder });

  const keyID = await backend.createKey();

  const token: HeldToken = {
    accessToken: 'fake-access-token',
    refreshToken: null,
    expiresAtMs: 1,
    keyID,
    clientCredentialID: 'client',
    accountSubject: null,
    state: { status: 'active', sinceMs: 0, lastSuccessAtMs: null, failures: 0, retryAtMs: null },
  };

  const savedRecord: CredentialEvent = {
    event: 'refresh_saved',
    credentialID: 'credential',
    attemptID: 'attempt',
    fingerprint: 'abcd1234',
  };

  const directory = await mkdtemp(join(tmpdir(), 'nixie-held-backend-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return {
    backend,
    token,
    written,
    recorder,
    savedRecord,
    file: join(directory, 'held.json'),
  };
}

test('it saves a token while the counter is the expected one', async () => {
  const ctx = await setupTest();
  const result = await ctx.backend.writeToken('credential', ctx.token, 0, null);
  const saved = await ctx.backend.readToken('credential');

  expect(result).toBe('saved');
  expect(saved).toStrictEqual(ctx.token);
});

test('it removes a credential, advances its counter and drops its key', async () => {
  const ctx = await setupTest();

  await ctx.backend.writeToken('credential', ctx.token, 0, null);

  const counter = await ctx.backend.remove('credential');
  const saved = await ctx.backend.readToken('credential');

  expect(counter).toBe(1);
  expect(saved).toBeNull();
  expect(ctx.backend.readKeyIDs()).toStrictEqual([]);
});

test('it refuses a token that arrives after a removal', async () => {
  const ctx = await setupTest();

  await ctx.backend.remove('credential');

  const result = await ctx.backend.writeToken('credential', ctx.token, 0, null);
  const saved = await ctx.backend.readToken('credential');

  expect(result).toBe('removed');
  expect(saved).toBeNull();
});

test('it keeps a state change away from a credential that is not held', async () => {
  const ctx = await setupTest();

  await ctx.backend.writeState('credential', ctx.token.state, 0);

  const saved = await ctx.backend.readToken('credential');

  expect(saved).toBeNull();
});

test('it writes the record of a token that saves, and none for a token a removal refused', async () => {
  const ctx = await setupTest();

  await ctx.backend.writeToken('credential', ctx.token, 0, ctx.savedRecord);
  await ctx.backend.remove('credential');
  await ctx.backend.writeToken('credential', ctx.token, 0, ctx.savedRecord);

  expect(ctx.written).toStrictEqual([ctx.savedRecord]);
});

test('it refuses a state change that carries an older counter than the credential has', async () => {
  const ctx = await setupTest();

  await ctx.backend.remove('credential');
  await ctx.backend.writeToken('credential', ctx.token, 1, null);

  const result = await ctx.backend.writeState('credential', { ...ctx.token.state, failures: 5 }, 0);
  const saved = await ctx.backend.readToken('credential');

  expect(result).toBe('removed');
  expect(saved?.state.failures).toBe(0);
});

test('it holds in a new backend on the same file what an earlier one saved', async () => {
  const ctx = await setupTest();

  const file = ctx.file;
  const first = createInMemoryHeldBackend({ recorder: ctx.recorder, file });

  await first.writeToken('credential', ctx.token, 0, null);
  await first.writeClient('client', { clientSecret: 'fake-client-secret' });
  await first.remove('other');

  const second = createInMemoryHeldBackend({ recorder: ctx.recorder, file });

  expect([
    await second.readToken('credential'),
    await second.readClient('client'),
    await second.readRemovalCounter('other'),
  ]).toStrictEqual([ctx.token, { clientSecret: 'fake-client-secret' }, 1]);
});
