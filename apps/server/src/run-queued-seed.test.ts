import { expect, mock, onTestFinished, test } from 'bun:test';
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
    buildPolicy: () => ({ rules: [], tools: [] }),
    inForce: ctx.context.inForce,
    state: buildStartState({ isReady: true, reason: null }),
    log: () => {},
  };

  const seed = () =>
    runSeed({ log: parts.context.log, source: parts.source, buildPolicy: parts.buildPolicy });

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
    buildPolicy: () => ({ rules: [], tools: [] }),
    inForce: ctx.context.inForce,
    state: buildStartState({ isReady: true, reason: null }),
    log: () => {},
  };

  const result = await runQueuedSeed(parts, () =>
    runSeed({ log: parts.context.log, source: parts.source, buildPolicy: parts.buildPolicy }),
  );

  expect(ctx.context.inForce.read()).toStrictEqual(result.inForce);
});

test('it writes one operator log line at startup that names each prompt with its safety part replaced or left out', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.root, 'nixie.yaml'),
    [
      'format: 3',
      'prompts:',
      '  writer:',
      '    safety: prompts/writer-safety.md',
      '  compaction:',
      '    _template: "{{ parts.instruction }}"',
      '',
    ].join('\n'),
  );

  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'prompts'));
  await writeFile(join(ctx.root, 'prompts', 'writer-safety.md'), 'Quote the owner.\n');

  const log = mock();

  const parts: SeedParts = {
    context: ctx.context.apiContext,
    source: createPathSource({ directory: ctx.root }),
    buildPolicy: () => ({ rules: [], tools: [] }),
    inForce: ctx.context.inForce,
    state: buildStartState({ isReady: true, reason: null }),
    log,
  };

  await runQueuedSeed(parts, () =>
    runSeed({ log: parts.context.log, source: parts.source, buildPolicy: parts.buildPolicy }),
  );

  expect(log).toHaveBeenCalledWith('prompts.safety_missing', {
    writer: 'replaced',
    compaction: 'omitted',
  });
});

test('it writes the safety line once while the same definitions stay in force', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.root, 'nixie.yaml'),
    'format: 3\nprompts:\n  session:\n    _template: "{{ persona }}"\n',
  );

  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const log = mock();

  const parts: SeedParts = {
    context: ctx.context.apiContext,
    source: createPathSource({ directory: ctx.root }),
    buildPolicy: () => ({ rules: [], tools: [] }),
    inForce: ctx.context.inForce,
    state: buildStartState({ isReady: true, reason: null }),
    log,
  };

  const seed = () =>
    runSeed({ log: parts.context.log, source: parts.source, buildPolicy: parts.buildPolicy });

  await runQueuedSeed(parts, seed);
  await runQueuedSeed(parts, seed);

  expect(log.mock.calls.filter(([event]) => event === 'prompts.safety_missing')).toStrictEqual([
    ['prompts.safety_missing', { session: 'omitted' }],
  ]);
});

test('it writes no safety line when every prompt keeps its safety part', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.root, 'nixie.yaml'),
    'format: 3\nprompts:\n  writer:\n    instruction: prompts/writer.md\n',
  );

  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'prompts'));
  await writeFile(join(ctx.root, 'prompts', 'writer.md'), 'Keep durable facts.\n');

  const log = mock();

  const parts: SeedParts = {
    context: ctx.context.apiContext,
    source: createPathSource({ directory: ctx.root }),
    buildPolicy: () => ({ rules: [], tools: [] }),
    inForce: ctx.context.inForce,
    state: buildStartState({ isReady: true, reason: null }),
    log,
  };

  await runQueuedSeed(parts, () =>
    runSeed({ log: parts.context.log, source: parts.source, buildPolicy: parts.buildPolicy }),
  );

  expect(log).not.toHaveBeenCalledWith('prompts.safety_missing', expect.anything());
});

test('it runs the next seed over the same parts after one fails, and gives the failure to its caller', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const logger = buildStubFailingLogger();

  const parts: SeedParts = {
    context: ctx.context.apiContext,
    source: createPathSource({ directory: ctx.root }),
    buildPolicy: () => ({ rules: [], tools: [] }),
    inForce: ctx.context.inForce,
    state: buildStartState({ isReady: true, reason: null }),
    log: logger.log,
  };

  const seed = () =>
    runSeed({ log: parts.context.log, source: parts.source, buildPolicy: parts.buildPolicy });

  const failed = runQueuedSeed(parts, seed);
  const next = runQueuedSeed(parts, seed);

  expect(failed).rejects.toThrow('the logger refused');
  expect(next).resolves.toMatchObject({ status: 'unchanged' });
});
