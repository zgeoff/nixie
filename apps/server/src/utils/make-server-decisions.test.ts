import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPolicyCall } from '@heynixie/policy/test-utils';
import { startTestLog } from '../test-utils/start-test-log';
import { makeServerDecisions } from './make-server-decisions';

async function setupTest() {
  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-decisions-'));

  onTestFinished(() => rm(dataDir, { recursive: true, force: true }));

  const log = await startTestLog(dataDir);

  onTestFinished(() => log.writer.stop());

  const declaration = {
    effects: ['send' as const],
    destinations: ['to'],
    amount: null,
    content: ['body'],
    results: {},
  };

  return {
    decide: makeServerDecisions({
      log,
      linkMaxAgeMs: 1000,
      readCheck: () => null,
      readOwnerDestinations: () => Promise.resolve(['Me@Example.org']),
    })(() => declaration),
  };
}

test('it allows a mail to an address that is you with no card, whatever its case', async () => {
  const ctx = await setupTest();

  const policy = await ctx.decide(
    buildPolicyCall({
      args: { to: 'me@example.org' },
      destinations: [{ value: 'me@example.org', replyTarget: false }],
    }),
  );

  expect(policy.decision).toMatchObject({
    outcome: 'allow',
    stage: 7,
    destinations: [{ value: 'me@example.org', permission: { by: 'place', trust: 'self' } }],
  });
});

test('it asks for a mail to an address that nothing names', async () => {
  const ctx = await setupTest();

  const policy = await ctx.decide(
    buildPolicyCall({
      args: { to: 'stranger@example.org' },
      destinations: [{ value: 'stranger@example.org', replyTarget: false }],
    }),
  );

  expect(policy.decision.outcome).toBe('ask');
});
