import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWriter, writeRecords } from '@heynixie/log';
import { createPathSource } from './create-path-source';
import { readRulesInForce } from './read-rules-in-force';
import { ruleFiresProjection } from './rule-fires-projection';
import { runSeed } from './run-seed';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-rules-in-force-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const root = join(directory, 'definitions');

  await mkdir(join(root, 'rules'), { recursive: true });

  const clock = { now: () => Date.parse('2026-10-16T09:00:00Z'), sleep: () => Promise.resolve() };

  const writer = await startWriter({ dataDir: directory, clock });

  stack.defer(() => writer.stop());

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  const log = { writer, deploymentKey, projections: [ruleFiresProjection] };

  return {
    root,
    log,
    seed: () =>
      runSeed({
        log,
        source: createPathSource({ directory: root }),
        buildPolicy: () => ({ rules: [], tools: [] }),
      }),
  };
}

test('it reads no rules before the first seed', async () => {
  const ctx = await setupTest();
  const rules = await readRulesInForce(ctx.log.writer.db);

  expect(rules).toStrictEqual([]);
});

test('it reads when a rule last decided a call', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'rules', 'mail.yaml'),
    'ask-mail:\n  outcome: ask\n  tools: [mail.send]\n',
  );

  await ctx.seed();

  await writeRecords(ctx.log, [
    {
      kind: 'tool_called',
      definitions: { snapshotHash: 'snapshot-a' },
      thread: 'conversation',
      decision: { outcome: 'ask', stage: 4, rule: { id: 'ask-mail', revision: 1 } },
    },
  ]);

  const rules = await readRulesInForce(ctx.log.writer.db);

  expect(rules.map((entry) => [entry.ruleID, entry.lastFiredAt])).toStrictEqual([
    ['ask-mail', Date.parse('2026-10-16T09:00:00Z')],
  ]);
});
