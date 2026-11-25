import { expect, test } from 'bun:test';
import { startFakeOAuthProvider } from '@heynixie/credentials/test-utils';
import { runOracle, startE2ENixie } from '@heynixie/server/test-utils';
import { waitFor } from '@zgeoff/testing';
import { z } from 'zod';

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

  const readKinds = async (prefix: string) => {
    const records = await nixie.readRecords();

    return records.map((record) => record.kind).filter((kind) => kind.startsWith(prefix));
  };

  const readKeys = async (running: ReturnType<typeof nixie.harness.start>) => {
    const keys = await running.request('readCredentialKeys', null);

    return z.number().parse(keys);
  };

  const countRevokes = () =>
    provider.requests.filter((request) => request.path === '/revoke').length;

  return { nixie, provider, config, readKinds, readKeys, countRevokes };
}

test('it sends the revocation once and finishes the forget on the start after a crash that followed it', async () => {
  const ctx = await setupTest();

  const first = ctx.nixie.harness.start();

  await first.ready;

  await first.request('connectCredential', ctx.config);

  const keysBefore = await ctx.readKeys(first);

  await first.request('arm', { point: 'erasure.revoked' });

  const forgetting = Promise.allSettled([first.request('forgetCredential', ctx.config)]);

  await first.waitForArrival('erasure.revoked');

  const keysAtRevocation = await ctx.readKeys(first);
  const recordedBeforeKill = await ctx.readKinds('connection.');

  await first.kill();

  await forgetting;

  const second = ctx.nixie.harness.start();

  await second.ready;

  await ctx.nixie.waitForRecord((record) => record.kind === 'erasure.finished');

  const keysAfter = await ctx.readKeys(second);
  const status = await second.request('readCredentialStatus', ctx.config);

  await second.kill();

  const oracle = await runOracle(ctx.nixie);

  // the outcome is in the log while every key of the connection is still there
  expect(recordedBeforeKill).toStrictEqual(['connection.revocation_recorded']);
  expect(keysAtRevocation).toBe(keysBefore);

  // the client's key stays, and the connection's two keys went
  expect(keysAfter).toBe(keysBefore - 2);
  expect(ctx.countRevokes()).toBe(1);

  const recordedAfterRestart = await ctx.readKinds('connection.');

  expect(recordedAfterRestart).toStrictEqual(['connection.revocation_recorded']);

  // the token is gone from the database too
  expect(status).toBeNull();
  expect(oracle.projectionDrift).toStrictEqual([]);
});

test('it records an unknown outcome and sends nothing for a forget that a crash cut before its revocation', async () => {
  const ctx = await setupTest();

  const first = ctx.nixie.harness.start();

  await first.ready;

  await first.request('connectCredential', ctx.config);
  await first.request('arm', { point: 'erasure.begun' });

  const forgetting = Promise.allSettled([first.request('forgetCredential', ctx.config)]);

  await first.waitForArrival('erasure.begun');
  await first.kill();

  await forgetting;

  const second = ctx.nixie.harness.start();

  await second.ready;

  await ctx.nixie.waitForRecord((record) => record.kind === 'erasure.finished');

  const keysAfter = await ctx.readKeys(second);

  await second.kill();

  const records = await ctx.nixie.readRecords();

  const revocations = records.filter((record) => record.kind === 'connection.revocation_recorded');

  expect(ctx.countRevokes()).toBe(0);
  expect(revocations.map((record) => record.payload['outcome'])).toStrictEqual(['unknown']);

  // only the client's key is left
  expect(keysAfter).toBe(1);
});

test('it never sends a second revocation however many times nixie restarts', async () => {
  const ctx = await setupTest();

  const first = ctx.nixie.harness.start();

  await first.ready;

  await first.request('connectCredential', ctx.config);
  await first.request('arm', { point: 'erasure.revoked' });

  const forgetting = Promise.allSettled([first.request('forgetCredential', ctx.config)]);

  await first.waitForArrival('erasure.revoked');
  await first.kill();

  await forgetting;

  for (let restart = 0; restart < 2; restart += 1) {
    const next = ctx.nixie.harness.start();

    await next.ready;

    await ctx.nixie.waitForRecord((record) => record.kind === 'erasure.finished');
    await next.kill();
  }

  expect(ctx.countRevokes()).toBe(1);
});

test('it records an unknown outcome and sends nothing more when a crash cut the revocation after the provider received it', async () => {
  const ctx = await setupTest();

  const first = ctx.nixie.harness.start();

  await first.ready;

  await first.request('connectCredential', ctx.config);

  // the provider takes the request and never answers it
  ctx.provider.answerRevoke(() => new Promise<Response>(() => {}));

  const forgetting = Promise.allSettled([first.request('forgetCredential', ctx.config)]);

  await waitFor(() => {
    expect(ctx.countRevokes()).toBe(1);
  });

  const recordedBeforeKill = await ctx.readKinds('connection.');

  await first.kill();

  await forgetting;

  const second = ctx.nixie.harness.start();

  await second.ready;

  await ctx.nixie.waitForRecord((record) => record.kind === 'erasure.finished');

  const status = await second.request('readCredentialStatus', ctx.config);

  await second.kill();

  const records = await ctx.nixie.readRecords();

  const revocations = records.filter((record) => record.kind === 'connection.revocation_recorded');

  expect(recordedBeforeKill).toStrictEqual([]);
  expect(ctx.countRevokes()).toBe(1);
  expect(revocations.map((record) => record.payload['outcome'])).toStrictEqual(['unknown']);
  expect(status).toBeNull();
});
