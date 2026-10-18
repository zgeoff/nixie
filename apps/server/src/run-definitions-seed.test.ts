import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPathSource } from '@heynixie/definitions';
import { buildServerContext } from './build-server-context';
import { buildStartState } from './build-start-state';
import type { SeedParts } from './run-definitions-seed';
import { runDefinitionsSeed } from './run-definitions-seed';
import { buildStubHeldSource } from './test-utils/build-stub-held-source';
import { startTestLog } from './test-utils/start-test-log';

// a fresh log, the definitions in force over it, and a definitions folder beside it
async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-definitions-seed-'));

  stack.defer(() => rm(dataDir, { recursive: true, force: true }));

  const log = await startTestLog(dataDir);

  stack.defer(() => log.writer.stop());

  const root = join(dataDir, 'definitions');

  await mkdir(root);

  const context = await buildServerContext(log.writer, log.deploymentKey, () => null);

  return { root, context };
}

test('it starts a second seed over the same parts only after the first returns', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const stub = buildStubHeldSource(createPathSource({ dir: ctx.root }));

  const parts: SeedParts = {
    context: ctx.context.apiContext,
    source: stub.source,
    policy: { rules: [], tools: [] },
    inForce: ctx.context.inForce,
    state: buildStartState({ isReady: true, reason: null }),
    log: () => {},
  };

  const seeds = [runDefinitionsSeed(parts), runDefinitionsSeed(parts)];

  stub.release();

  const results = await Promise.all(seeds);

  expect(stub.events).toStrictEqual(['start', 'end', 'start', 'end']);
  expect(results.map((result) => result.status)).toStrictEqual(['seeded', 'unchanged']);
});
