import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readLiveAddressRefs, readOwnerAddress } from '@heynixie/connections';
import { googleScopes, startGoogleConnections } from '@heynixie/connections/test-utils';
import type { SelfPlacesReader } from '@heynixie/definitions';
import { createPathSource, runSeed } from '@heynixie/definitions';
import { buildTestTaskSeed } from '@heynixie/definitions/test-utils';
import { buildPolicyCall } from '@heynixie/policy/test-utils';
import invariant from 'tiny-invariant';
import { startTestLog } from '../test-utils/start-test-log';
import { makeServerDecisions } from './make-server-decisions';

async function setupTest() {
  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-decisions-'));

  onTestFinished(() => rm(dataDir, { recursive: true, force: true }));

  const log = await startTestLog(dataDir);

  onTestFinished(() => log.writer.stop());

  const root = join(dataDir, 'definitions');

  await mkdir(root);
  await writeFile(join(root, 'nixie.yaml'), 'format: 7\n');
  await writeFile(join(root, 'persona.md'), '# Persona\n');

  const declaration = {
    effects: ['send' as const],
    destinations: ['to'],
    amount: null,
    content: ['body'],
    results: {},
  };

  const accounts = new Map<string, string>();

  const decide = makeServerDecisions({
    log,
    linkMaxAgeMs: 1000,
    readCheck: () => null,
    readOwnerAddress: (reference) => Promise.resolve(accounts.get(reference) ?? null),
  })(() => declaration);

  const google = await startGoogleConnections({ sharedLog: { log, dataDir } });

  const decideLive = makeServerDecisions({
    log,
    linkMaxAgeMs: 1000,
    readCheck: () => null,
    readOwnerAddress: (reference) => readOwnerAddress(log, reference),
  })(() => declaration);

  const runSnapshot = async (readSelfPlaces: SelfPlacesReader) => {
    const seeded = await runSeed({
      tasks: buildTestTaskSeed(),
      log,
      source: createPathSource({ directory: root }),
      buildPolicy: () => ({ rules: [], tools: [] }),
      readSelfPlaces,
    });

    invariant(seeded.inForce);

    return seeded.inForce.snapshotHash;
  };

  return {
    accounts,
    google,
    runSnapshot: () => runSnapshot(() => Promise.resolve([...accounts.keys()])),
    runLiveSnapshot: () => runSnapshot(readLiveAddressRefs),
    decideMail: (snapshot: string, to: string) =>
      decide(
        buildPolicyCall({
          args: { to },
          destinations: [{ value: to, replyTarget: false }],
          snapshot,
        }),
      ),
    readLiveOutcomes: (snapshot: string, addresses: readonly string[]) =>
      Promise.all(
        addresses.map(async (to) => {
          const decided = await decideLive(
            buildPolicyCall({
              args: { to },
              destinations: [{ value: to, replyTarget: false }],
              snapshot,
            }),
          );

          return decided.decision.outcome;
        }),
      ),
  };
}

test("it allows each snapshot only its own address of a connection that a renewal moved, and neither once it's forgotten", async () => {
  const ctx = await setupTest();

  await ctx.google.connect('code-work');

  const before = await ctx.runLiveSnapshot();
  const [listed] = await ctx.google.connections.list();

  ctx.google.google.accounts.set('code-renamed', {
    sub: 'sub-work',
    email: 'renamed@example.test',
    scopes: googleScopes,
    hasRefreshToken: true,
  });

  await ctx.google.connect('code-renamed', listed?.connection ?? null);

  const after = await ctx.runLiveSnapshot();

  const addresses = ['work@example.test', 'renamed@example.test'];

  const renewed = {
    before: await ctx.readLiveOutcomes(before, addresses),
    after: await ctx.readLiveOutcomes(after, addresses),
  };

  await ctx.google.connections.forgetConnection(listed?.connection ?? '');

  const forgotten = {
    before: await ctx.readLiveOutcomes(before, addresses),
    after: await ctx.readLiveOutcomes(after, addresses),
  };

  expect({ renewed, forgotten }).toStrictEqual({
    renewed: { before: ['allow', 'ask'], after: ['ask', 'allow'] },
    forgotten: { before: ['ask', 'ask'], after: ['ask', 'ask'] },
  });
});

test('it allows a mail to an address that is you with no card, whatever its case', async () => {
  const ctx = await setupTest();

  ctx.accounts.set('account-1', 'Me@Example.org');

  const snapshot = await ctx.runSnapshot();
  const policy = await ctx.decideMail(snapshot, 'me@example.org');

  expect(policy.decision).toMatchObject({
    outcome: 'allow',
    stage: 7,
    destinations: [{ value: 'me@example.org', permission: { by: 'place', trust: 'self' } }],
  });
});

test('it asks for a mail to an address that nothing names', async () => {
  const ctx = await setupTest();

  ctx.accounts.set('account-1', 'Me@Example.org');

  const snapshot = await ctx.runSnapshot();
  const policy = await ctx.decideMail(snapshot, 'stranger@example.org');

  expect(policy.decision.outcome).toBe('ask');
});

test('it asks for a mail to an account connected after the snapshot of the call', async () => {
  const ctx = await setupTest();
  const snapshot = await ctx.runSnapshot();

  ctx.accounts.set('account-1', 'me@example.org');

  const policy = await ctx.decideMail(snapshot, 'me@example.org');

  expect(policy.decision.outcome).toBe('ask');
});

test('it allows a mail to an account connected before the next snapshot', async () => {
  const ctx = await setupTest();

  await ctx.runSnapshot();

  ctx.accounts.set('account-1', 'me@example.org');

  const snapshot = await ctx.runSnapshot();
  const policy = await ctx.decideMail(snapshot, 'me@example.org');

  expect(policy.decision.outcome).toBe('allow');
});

test('it asks for a mail to an account whose connection was forgotten, under the same snapshot', async () => {
  const ctx = await setupTest();

  ctx.accounts.set('account-1', 'me@example.org');

  const snapshot = await ctx.runSnapshot();

  ctx.accounts.delete('account-1');

  const policy = await ctx.decideMail(snapshot, 'me@example.org');

  expect(policy.decision.outcome).toBe('ask');
});
