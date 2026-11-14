import { expect, test } from 'bun:test';
import { verifySessionToken } from '../verify-session-token';
import { seedIdentity } from './seed-identity';
import { startTestAPI } from './start-test-api';

test('it enrols an identity whose token resolves to the caller it returns', async () => {
  const ctx = await startTestAPI();
  const identity = await seedIdentity(ctx.context, { deviceName: 'phone' });
  const caller = await verifySessionToken(ctx.context, identity.token);

  expect(identity.caller).toStrictEqual({
    identityID: identity.sessionID,
    channel: 'client',
    label: 'phone',
    pairedAt: 1_000_000,
    lastSeenAt: 1_000_000,
  });

  expect(caller).toStrictEqual(identity.caller);
});

test('it names the device laptop when it is given no name', async () => {
  const ctx = await startTestAPI();
  const identity = await seedIdentity(ctx.context);

  expect(identity.caller.label).toBe('laptop');
});
