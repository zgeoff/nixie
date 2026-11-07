import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWriter } from '@heynixie/log';
import { proposalLapseMs } from '@heynixie/proposals';
import { createPathSource } from './create-path-source';
import { readRuleProposals } from './read-rule-proposals';
import { runSeed } from './run-seed';
import { writeRuleProposalLapses } from './write-rule-proposal-lapses';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-rule-lapses-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const root = join(directory, 'definitions');

  await mkdir(join(root, 'rules'), { recursive: true });

  const time = { now: Date.parse('2026-10-16T09:00:00Z') };
  const clock = { now: () => time.now, sleep: () => Promise.resolve() };

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
    time,
    seed: () =>
      runSeed({
        log,
        source: createPathSource({ directory: root }),
        buildPolicy: () => ({ rules: [], tools: [] }),
      }),
    context: { log, clock, definitions: () => ({ snapshotHash: 'snapshot-a' }) },
  };
}

test('it lapses a rule change proposal left unanswered past its lapse time', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'rules', 'web.yaml'),
    'allow-web:\n  outcome: allow\n  tools: [web.fetch]\n',
  );

  await ctx.seed();

  ctx.time.now += proposalLapseMs;

  const lapsed = await writeRuleProposalLapses(ctx.context);
  const proposals = await readRuleProposals(ctx.log.writer.db);

  expect({ lapsed, outcomes: proposals.map((entry) => entry.outcome) }).toStrictEqual({
    lapsed: 1,
    outcomes: ['lapsed'],
  });
});

test('it leaves a rule change proposal within its lapse time pending', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'rules', 'web.yaml'),
    'allow-web:\n  outcome: allow\n  tools: [web.fetch]\n',
  );

  await ctx.seed();

  ctx.time.now += proposalLapseMs - 1;

  const lapsed = await writeRuleProposalLapses(ctx.context);

  expect(lapsed).toBe(0);
});

test('it leaves a withdrawn rule change proposal withdrawn', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'rules', 'web.yaml'),
    'allow-web:\n  outcome: allow\n  tools: [web.fetch]\n',
  );

  await ctx.seed();

  await writeFile(
    join(ctx.root, 'rules', 'web.yaml'),
    'allow-web:\n  outcome: allow\n  tools: [web.*]\n',
  );

  await ctx.seed();

  ctx.time.now += proposalLapseMs;

  await writeRuleProposalLapses(ctx.context);

  const proposals = await readRuleProposals(ctx.log.writer.db);

  expect(proposals.map((entry) => entry.outcome)).toStrictEqual(['withdrawn', 'lapsed']);
});
