import { expect, test } from 'bun:test';
import type { HeldToken } from '../held/types';
import { createInMemoryHeldBackend } from './create-in-memory-held-backend';

async function setupTest() {
  const backend = createInMemoryHeldBackend();

  const keyID = await backend.createKey();

  const token: HeldToken = {
    accessToken: 'fake-access-token',
    refreshToken: null,
    expiresAtMs: 1,
    keyID,
    clientCredentialID: 'client',
    state: { status: 'active', sinceMs: 0, lastSuccessAtMs: null, failures: 0, retryAtMs: null },
  };

  return { backend, token };
}

test('it saves a token while the counter is the expected one', async () => {
  const ctx = await setupTest();
  const result = await ctx.backend.writeToken('credential', ctx.token, 0);
  const saved = await ctx.backend.readToken('credential');

  expect(result).toBe('saved');
  expect(saved).toStrictEqual(ctx.token);
});

test('it removes a credential, advances its counter and drops its key', async () => {
  const ctx = await setupTest();

  await ctx.backend.writeToken('credential', ctx.token, 0);

  const counter = await ctx.backend.remove('credential');
  const saved = await ctx.backend.readToken('credential');

  expect(counter).toBe(1);
  expect(saved).toBeNull();
  expect(ctx.backend.readKeyIDs()).toStrictEqual([]);
});

test('it refuses a token that arrives after a removal', async () => {
  const ctx = await setupTest();

  await ctx.backend.remove('credential');

  const result = await ctx.backend.writeToken('credential', ctx.token, 0);
  const saved = await ctx.backend.readToken('credential');

  expect(result).toBe('removed');
  expect(saved).toBeNull();
});

test('it keeps a state change away from a credential that is not held', async () => {
  const ctx = await setupTest();

  await ctx.backend.writeState('credential', ctx.token.state);

  const saved = await ctx.backend.readToken('credential');

  expect(saved).toBeNull();
});
