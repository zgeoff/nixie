import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

  return {
    accounts,
    runSnapshot: async () => {
      const seeded = await runSeed({
        tasks: buildTestTaskSeed(),
        log,
        source: createPathSource({ directory: root }),
        buildPolicy: () => ({ rules: [], tools: [] }),
        readSelfPlaces: () => Promise.resolve([...accounts.keys()]),
      });

      invariant(seeded.inForce);

      return seeded.inForce.snapshotHash;
    },
    decideMail: (snapshot: string, to: string) =>
      decide(
        buildPolicyCall({
          args: { to },
          destinations: [{ value: to, replyTarget: false }],
          snapshot,
        }),
      ),
  };
}

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
