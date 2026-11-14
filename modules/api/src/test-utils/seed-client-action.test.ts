import { expect, test } from 'bun:test';
import { seedClientAction } from './seed-client-action';
import { seedIdentity } from './seed-identity';
import { startTestAPI } from './start-test-api';

test('it records the client action it is given and returns it as the module reads it', async () => {
  const ctx = await startTestAPI();
  const identity = await seedIdentity(ctx.context);

  const action = await seedClientAction(ctx.context, {
    clientActionID: '6d1f3b5a-7c9e-4a2b-8d0f-2e4a6c8b0d13',
    procedure: 'conversation.forget',
    identityID: identity.sessionID,
  });

  expect(action).toStrictEqual({
    procedure: 'conversation.forget',
    identityID: identity.sessionID,
    inputHash: expect.any(String),
    result: { retriedAt: 1_000_000 },
  });
});
