import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { startGoogleConnections } from '../test-utils/start-google-connections';

async function setupTest() {
  const ctx = await startGoogleConnections();
  const connected = await ctx.connect('code-work');

  invariant(connected.kind === 'finished', 'the consent finishes');

  return { ...ctx, short: connected.connection };
}

test('it forgets a connection to its end, and lists it with no label and no account', async () => {
  const ctx = await setupTest();
  const result = await ctx.connections.forgetConnection(ctx.short);
  const [listed] = await ctx.connections.list();

  expect([result.kind === 'forgotten' ? result.state : null, listed]).toStrictEqual([
    { erasure: 'done', revocation: 'confirmed', finishedSequence: expect.any(Number) },
    expect.objectContaining({
      connection: ctx.short,
      label: null,
      account: null,
      status: 'forgotten',
      forget: { erasure: 'done', revocation: 'confirmed', finishedSequence: expect.any(Number) },
    }),
  ]);
});

test('it answers a forget that did not finish as pending, and the runner finishes it', async () => {
  const ctx = await setupTest();

  ctx.effects.crashAt('erasure.revoked');

  const result = await ctx.connections.forgetConnection(ctx.short);
  const before = await ctx.connections.readForgetState(ctx.short);

  await ctx.runner.finishOpen();

  const after = await ctx.connections.readForgetState(ctx.short);

  expect([
    result.kind === 'forgotten' ? result.state : null,
    before?.state,
    after?.state,
  ]).toStrictEqual([
    { erasure: 'pending', revocation: 'confirmed', finishedSequence: null },
    { erasure: 'pending', revocation: 'confirmed', finishedSequence: null },
    { erasure: 'done', revocation: 'confirmed', finishedSequence: expect.any(Number) },
  ]);
});

test('it answers an unknown connection, and one already forgotten', async () => {
  const ctx = await setupTest();

  await ctx.connections.forgetConnection(ctx.short);

  const again = await ctx.connections.forgetConnection(ctx.short);
  const unknown = await ctx.connections.forgetConnection('unknownconn');
  const state = await ctx.connections.readForgetState('unknownconn');

  expect([again, unknown, state]).toStrictEqual([
    { kind: 'connection_not_found' },
    { kind: 'connection_not_found' },
    null,
  ]);
});

test('it stops using the connection at once, and a later call fails with the credential error', async () => {
  const ctx = await setupTest();
  const [row] = await ctx.readRows();
  const context = await ctx.connections.readContext(row?.connection_id ?? '');

  await ctx.connections.forgetConnection(ctx.short);

  const sending = context?.fetch(`${ctx.provider.apiOrigin}/gmail/v1/users/me/labels`);

  const [outcome] = await Promise.allSettled([sending]);

  expect(outcome).toMatchObject({ status: 'rejected', reason: { name: 'CredentialRemovedError' } });
});
