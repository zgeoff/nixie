import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRecords } from '@heynixie/log';
import { waitFor } from '@zgeoff/testing';
import { createFakeClock } from '@zgeoff/testing/clock';
import { buildHeldSpec } from '../test-utils/build-held-spec';
import { createHeldTestStore } from '../test-utils/create-held-test-store';
import { startCredentialTestLog } from '../test-utils/start-credential-test-log';
import { startFakeOAuthProvider } from '../test-utils/start-fake-oauth-provider';

// A crash test: a child process starts a refresh and dies by SIGKILL while the request is on the
// wire, and this process opens the same data directory as the next start does.
async function setupTest() {
  const provider = await startFakeOAuthProvider();

  const unanswered = Promise.withResolvers<Response>();

  provider.answerToken((request) =>
    request.form['grant_type'] === 'refresh_token'
      ? unanswered.promise
      : Response.json({
          access_token: 'fake-access-token-1',
          refresh_token: 'fake-refresh-token-1',
        }),
  );

  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-credentials-crash-'));

  onTestFinished(() => rm(dataDir, { recursive: true, force: true }));

  const config = {
    dataDir,
    ca: provider.ca,
    origin: provider.origin,
    tokenURL: provider.tokenURL,
    revokeURL: provider.revokeURL,
    clientCredentialID: crypto.randomUUID(),
    tokenCredentialID: crypto.randomUUID(),
  };

  const childPath = join(import.meta.dir, '../test-utils/run-refresh-child.ts');

  const child = Bun.spawn([process.execPath, childPath, JSON.stringify(config)], {
    cwd: dataDir,
    stdout: 'ignore',
    stderr: 'inherit',
  });

  onTestFinished(() => child.kill('SIGKILL'));

  const killDuringRefresh = async () => {
    await waitFor(
      () => {
        const refreshes = provider.requests.filter(
          (request) => request.form['grant_type'] === 'refresh_token',
        );

        expect(refreshes).toHaveLength(1);
      },
      { timeoutMs: 20_000 },
    );

    child.kill('SIGKILL');

    await child.exited;
  };

  const clock = createFakeClock({ startMs: Date.parse('2026-10-16T09:00:00Z') });

  const startNext = async () => {
    const testLog = await startCredentialTestLog({ clock, dataDir });

    const held = await createHeldTestStore({
      log: testLog.log,
      ca: provider.ca,
      now: () => clock.now(),
    });

    await held.backend.writeClient(config.clientCredentialID, {
      clientSecret: 'fake-client-secret',
    });

    const client = await held.store.registerHeld(
      { backend: 'database', credentialID: config.clientCredentialID },
      buildHeldSpec(provider, 'oauth_client'),
    );

    // the data the next start holds: the token the refresh began from
    await held.store.exchange(client, {
      code: 'fake-code',
      redirectURI: 'https://nixie.example/callback',
      credentialID: config.tokenCredentialID,
    });

    const token = await held.store.registerHeld(
      { backend: 'database', credentialID: config.tokenCredentialID },
      buildHeldSpec(provider, 'oauth_token'),
    );

    return {
      recover: () => held.store.recover(),
      readStatus: () => held.store.readStatus(token),
      readKinds: async () => {
        const page = await readRecords(testLog.log, { afterSequence: 0 });

        return page.map((entry) => entry.record.kind);
      },
    };
  };

  return { killDuringRefresh, startNext };
}

test('it marks the credential needs_consent when a start finds a refresh with no saved result', async () => {
  const ctx = await setupTest();

  await ctx.killDuringRefresh();

  const next = await ctx.startNext();
  const kindsBefore = await next.readKinds();

  await next.recover();

  const status = await next.readStatus();
  const kindsAfter = await next.readKinds();

  expect(kindsBefore).toStrictEqual(['credential.refresh_started']);
  expect(status).toMatchObject({ status: 'needs_consent' });

  expect(kindsAfter).toStrictEqual([
    'credential.refresh_started',
    'credential.status_changed',
    'credential.refresh_lost',
  ]);
});

test('it finds nothing to recover on the start after the one that marked the credential', async () => {
  const ctx = await setupTest();

  await ctx.killDuringRefresh();

  const next = await ctx.startNext();

  await next.recover();
  await next.recover();

  const kinds = await next.readKinds();

  expect(kinds).toStrictEqual([
    'credential.refresh_started',
    'credential.status_changed',
    'credential.refresh_lost',
  ]);
});
