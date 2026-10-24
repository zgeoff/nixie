import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPathSource } from '@heynixie/definitions';
import { buildStartState } from './build-start-state';
import { createServerContext } from './create-server-context';
import { runDefinitionsSeed } from './run-definitions-seed';
import type { SeedParts } from './run-queued-seed';
import { startTestLog } from './test-utils/start-test-log';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-definitions-seed-'));

  stack.defer(() => rm(dataDir, { recursive: true, force: true }));

  const log = await startTestLog(dataDir);

  stack.defer(() => log.writer.stop());

  const root = join(dataDir, 'definitions');

  await mkdir(root);

  const context = await createServerContext(log.writer, log.deploymentKey, () => null);

  return { root, context };
}

test('it turns the definitions part unready while a refused snapshot is pending, and keeps the last good seed in force', async () => {
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

  const first = await runDefinitionsSeed(parts);

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: [1\n');

  const refused = await runDefinitionsSeed(parts);

  expect(refused.status).toBe('refused');

  expect(parts.state.read().definitions).toStrictEqual({
    isReady: false,
    reason: 'the last snapshot was refused: DefinitionsParseError',
  });

  expect(ctx.context.inForce.read()).toStrictEqual(first.inForce);
});

test('it turns the definitions part ready once a seed succeeds', async () => {
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

  await runDefinitionsSeed(parts);

  expect(parts.state.read().definitions).toStrictEqual({ isReady: true, reason: null });
});
