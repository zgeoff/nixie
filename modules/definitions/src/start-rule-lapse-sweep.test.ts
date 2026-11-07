import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWriter } from '@heynixie/log';
import { proposalLapseMs } from '@heynixie/proposals';
import { buildTestClock, waitForCondition } from '@heynixie/testing';
import { createPathSource } from './create-path-source';
import { readRuleProposals } from './read-rule-proposals';
import { runSeed } from './run-seed';
import { startRuleLapseSweep } from './start-rule-lapse-sweep';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-rule-sweep-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const root = join(directory, 'definitions');

  await mkdir(join(root, 'rules'), { recursive: true });

  const proposedAt = Date.UTC(2026, 9, 16, 9, 0);
  const clock = buildTestClock(proposedAt);

  const writer = await startWriter({ dataDir: directory, clock });

  stack.defer(() => writer.stop());

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  const log = { writer, deploymentKey, projections: [] };

  return {
    root,
    log,
    clock,
    seed: () =>
      runSeed({
        log,
        source: createPathSource({ directory: root }),
        buildPolicy: () => ({ rules: [], tools: [] }),
      }),
  };
}

test('it records the lapse of a rule change proposal past its lapse time on the hourly sweep', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'rules', 'web.yaml'),
    'allow-web:\n  outcome: allow\n  tools: [web.fetch]\n',
  );

  await ctx.seed();

  ctx.clock.advance(proposalLapseMs);

  const sweep = startRuleLapseSweep({
    context: {
      log: ctx.log,
      clock: ctx.clock,
      definitions: () => ({ snapshotHash: 'snapshot-a' }),
    },
    clock: ctx.clock,
    onError: () => {},
  });

  onTestFinished(() => sweep.stop());

  await waitForCondition(() => ctx.clock.countSleepers() > 0);

  ctx.clock.advance(60 * 60 * 1000);

  await waitForCondition(async () => {
    const proposals = await readRuleProposals(ctx.log.writer.db);

    return proposals.some((entry) => entry.outcome === 'lapsed');
  });

  await sweep.stop();

  const proposals = await readRuleProposals(ctx.log.writer.db);

  expect(proposals.map((entry) => entry.outcome)).toStrictEqual(['lapsed']);
});
