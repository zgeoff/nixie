import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPathSource } from '@heynixie/definitions';
import { buildServerContext } from './build-server-context';
import { refreshDefinitions } from './refresh-definitions';
import { startTestLog } from './test-utils/start-test-log';
import type { ServerParts } from './types';

// a fresh log, the definitions in force over it, and a definitions folder beside it
async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-refresh-definitions-'));

  stack.defer(() => rm(dataDir, { recursive: true, force: true }));

  const log = await startTestLog(dataDir);

  stack.defer(() => log.writer.stop());

  const root = join(dataDir, 'definitions');

  await mkdir(root);

  const context = await buildServerContext(log.writer, log.deploymentKey, () => null);

  return { root, context };
}

test('it seeds a new revision and returns the definitions it put in force', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  // a seed reads only these parts
  const parts = {
    context: ctx.context.apiContext,
    source: createPathSource({ dir: ctx.root }),
    policy: { rules: [], tools: [] },
    inForce: ctx.context.inForce,
    state: { update: mock() },
    log: mock(),
  } as unknown as ServerParts;

  const inForce = await refreshDefinitions(parts, ctx.context.inForce);

  expect(inForce?.persona).toBe('# Persona\n');
});

test('it returns the definitions in force, and seeds nothing, before the server parts start', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const inForce = await refreshDefinitions(null, ctx.context.inForce);

  expect(inForce).toBeNull();
});
