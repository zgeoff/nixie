import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPathSource, runSeed } from '@heynixie/definitions';
import { buildStartState } from './build-start-state';
import { createServerContext } from './create-server-context';
import type { SeedParts } from './run-queued-seed';
import { runQueuedSeed } from './run-queued-seed';
import { buildStubFailingLogger } from './test-utils/build-stub-failing-logger';
import { buildStubHeldSource } from './test-utils/build-stub-held-source';
import { startTestLog } from './test-utils/start-test-log';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-queued-seed-'));

  stack.defer(() => rm(dataDir, { recursive: true, force: true }));

  const log = await startTestLog(dataDir);

  stack.defer(() => log.writer.stop());

  const root = join(dataDir, 'definitions');

  await mkdir(root);

  const context = await createServerContext(log.writer, log.deploymentKey, () => null);

  return { root, context };
}

test('it starts a second seed over the same parts only after the first returns', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const stub = buildStubHeldSource(createPathSource({ directory: ctx.root }));

  const parts: SeedParts = {
    context: ctx.context.apiContext,
    source: stub.source,
    policy: { rules: [], tools: [] },
    inForce: ctx.context.inForce,
    state: buildStartState({ isReady: true, reason: null }),
    log: () => {},
  };

  const seed = () =>
    runSeed({ log: parts.context.log, source: parts.source, policy: parts.policy });

  const seeds = [runQueuedSeed(parts, seed), runQueuedSeed(parts, seed)];

  stub.release();

  const results = await Promise.all(seeds);

  expect(stub.events).toStrictEqual(['start', 'end', 'start', 'end']);
  expect(results.map((result) => result.status)).toStrictEqual(['seeded', 'unchanged']);
});

test('it puts the seeded definitions in force', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const parts: SeedParts = {
    context: ctx.context.apiContext,
    source: createPathSource({ directory: ctx.root }),
    policy: { rules: [], tools: [] },
    inForce: ctx.context.inForce,
    state: buildStartState({ isReady: true, reason: null }),
    log: () => {},
  };

  const result = await runQueuedSeed(parts, () =>
    runSeed({ log: parts.context.log, source: parts.source, policy: parts.policy }),
  );

  expect(ctx.context.inForce.read()).toStrictEqual(result.inForce);
});

test('it runs the next seed over the same parts after one fails, and gives the failure to its caller', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const logger = buildStubFailingLogger();

  const parts: SeedParts = {
    context: ctx.context.apiContext,
    source: createPathSource({ directory: ctx.root }),
    policy: { rules: [], tools: [] },
    inForce: ctx.context.inForce,
    state: buildStartState({ isReady: true, reason: null }),
    log: logger.log,
  };

  const seed = () =>
    runSeed({ log: parts.context.log, source: parts.source, policy: parts.policy });

  const failed = runQueuedSeed(parts, seed);
  const next = runQueuedSeed(parts, seed);

  expect(failed).rejects.toThrow('the logger refused');
  expect(next).resolves.toMatchObject({ status: 'unchanged' });
});
