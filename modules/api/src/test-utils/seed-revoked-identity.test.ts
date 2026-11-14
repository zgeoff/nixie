import { expect, test } from 'bun:test';
import { verifySessionToken } from '../session/verify-session-token';
import { seedRevokedIdentity } from './seed-revoked-identity';
import { startTestAPI } from './start-test-api';

test('it leaves an identity whose token no longer resolves', async () => {
  const ctx = await startTestAPI();
  const identity = await seedRevokedIdentity(ctx.context, { deviceName: 'phone' });

  expect(identity.caller.label).toBe('phone');

  const caller = await verifySessionToken(ctx.context, identity.token);

  expect(caller).toBeNull();
});
