import { expect, test } from 'bun:test';
import { startFakeOAuthProvider } from '@heynixie/credentials/test-utils';
import { runOracle, startE2ENixie } from '@heynixie/server/test-utils';
import { waitFor } from '@zgeoff/testing';

async function setupTest() {
  const nixie = await startE2ENixie();
  const provider = await startFakeOAuthProvider();

  const config = {
    ca: provider.ca,
    origin: provider.origin,
    tokenURL: provider.tokenURL,
    revokeURL: provider.revokeURL,
    clientCredentialID: crypto.randomUUID(),
    tokenCredentialID: crypto.randomUUID(),
  };

  const readCredentialKinds = async () => {
    const records = await nixie.readRecords();

    return records.map((record) => record.kind).filter((kind) => kind.startsWith('credential.'));
  };

  return { nixie, provider, config, readCredentialKinds };
}

test('it marks the credential needs_consent when a start finds a refresh with no saved result', async () => {
  const ctx = await setupTest();

  const unanswered = Promise.withResolvers<Response>();

  ctx.provider.answerToken((request) =>
    request.form['grant_type'] === 'refresh_token'
      ? unanswered.promise
      : Response.json({
          access_token: 'fake-access-token-1',
          refresh_token: 'fake-refresh-token-1',
        }),
  );

  const first = ctx.nixie.harness.start();

  await first.ready;

  await first.request('connectCredential', ctx.config);

  const refreshing = Promise.allSettled([first.request('refreshCredential', ctx.config)]);

  await waitFor(() => {
    expect(
      ctx.provider.requests.filter((request) => request.form['grant_type'] === 'refresh_token'),
    ).toHaveLength(1);
  });

  await first.kill();

  await refreshing;

  const second = ctx.nixie.harness.start();

  await second.ready;

  const status = await second.request('readCredentialStatus', ctx.config);
  const kinds = await ctx.readCredentialKinds();

  await second.kill();

  const oracle = await runOracle(ctx.nixie);

  expect(status).toBe('needs_consent');

  expect(kinds).toStrictEqual([
    'credential.refresh_started',
    'credential.status_changed',
    'credential.refresh_lost',
  ]);

  expect(oracle.projectionDrift).toStrictEqual([]);
});

test('it finds nothing to recover on the start after the one that marked the credential', async () => {
  const ctx = await setupTest();

  const unanswered = Promise.withResolvers<Response>();

  ctx.provider.answerToken((request) =>
    request.form['grant_type'] === 'refresh_token'
      ? unanswered.promise
      : Response.json({
          access_token: 'fake-access-token-1',
          refresh_token: 'fake-refresh-token-1',
        }),
  );

  const first = ctx.nixie.harness.start();

  await first.ready;

  await first.request('connectCredential', ctx.config);

  const refreshing = Promise.allSettled([first.request('refreshCredential', ctx.config)]);

  await ctx.nixie.waitForRecord((record) => record.kind === 'credential.refresh_started');
  await first.kill();

  await refreshing;

  const second = ctx.nixie.harness.start();

  await second.ready;

  await second.kill();

  const third = ctx.nixie.harness.start();

  await third.ready;

  const kinds = await ctx.readCredentialKinds();

  await third.kill();

  expect(kinds).toStrictEqual([
    'credential.refresh_started',
    'credential.status_changed',
    'credential.refresh_lost',
  ]);
});

test('it keeps the saved token and its record together when the process dies between them', async () => {
  const ctx = await setupTest();

  const first = ctx.nixie.harness.start();

  await first.ready;

  await first.request('connectCredential', ctx.config);
  await first.request('arm', { point: 'credential.refresh.token_saved' });

  const refreshing = Promise.allSettled([first.request('refreshCredential', ctx.config)]);

  await first.waitForArrival('credential.refresh.token_saved');
  await first.kill();

  await refreshing;

  const second = ctx.nixie.harness.start();

  await second.ready;

  const status = await second.request('readCredentialStatus', ctx.config);
  const kinds = await ctx.readCredentialKinds();

  await second.kill();

  expect(status).toBe('active');
  expect(kinds).toStrictEqual(['credential.refresh_started', 'credential.refresh_saved']);
});
