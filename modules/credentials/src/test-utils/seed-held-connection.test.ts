import { expect, test } from 'bun:test';
import { createFakeClock } from '@zgeoff/testing/clock';
import { createHeldTestStore } from './create-held-test-store';
import { seedHeldConnection } from './seed-held-connection';
import { startCredentialTestLog } from './start-credential-test-log';
import { startFakeOAuthProvider } from './start-fake-oauth-provider';

async function setupTest() {
  const provider = await startFakeOAuthProvider();

  const clock = createFakeClock({ startMs: Date.parse('2026-10-16T09:00:00Z') });

  const testLog = await startCredentialTestLog({ clock });
  const held = await createHeldTestStore({ log: testLog.log, ca: provider.ca, now: clock.now });

  return { provider, held };
}

test('it connects a token that the store holds as active', async () => {
  const ctx = await setupTest();
  const connection = await seedHeldConnection(ctx.held, ctx.provider);
  const status = await ctx.held.store.readStatus(connection.token);
  const token = await ctx.held.backend.readToken(connection.tokenRef.credentialID);

  expect(status?.status).toBe('active');
  expect(token?.accessToken).toBe('fake-access-token-1');
});
