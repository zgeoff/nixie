import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWriter } from '@heynixie/log';
import { createPathSource } from './create-path-source';
import { findDefinitionsInForce } from './find-definitions-in-force';
import { runSeed } from './run-seed';

// the writer's data directory holds the definitions root too, so one removal cleans up both
async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dir = await mkdtemp(join(tmpdir(), 'nixie-in-force-'));

  stack.defer(() => rm(dir, { recursive: true, force: true }));

  const root = join(dir, 'definitions');
  const writer = await startWriter({ dataDir: dir });

  stack.defer(() => writer.stop());
  await mkdir(root);

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  return {
    root,
    writer,
    log: { writer, deploymentKey, projections: [] },
    source: createPathSource({ dir: root }),
  };
}

test('it finds nothing before the first seed', async () => {
  const ctx = await setupTest();

  const inForce = await findDefinitionsInForce(ctx.writer.db);

  expect(inForce).toBeNull();
});

test('it finds the definitions the newest seed put in force', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 1\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const policy = { rules: [], tools: [] };

  await runSeed({ log: ctx.log, source: ctx.source, policy });
  await writeFile(join(ctx.root, 'persona.md'), '# Persona, edited\n');

  const newest = await runSeed({ log: ctx.log, source: ctx.source, policy });
  const inForce = await findDefinitionsInForce(ctx.writer.db);

  expect(inForce).toStrictEqual(newest.inForce);
});

test('it finds the persona text the newest seed holds', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 1\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n\nWarm,  \nbrief.\n\n');
  await runSeed({ log: ctx.log, source: ctx.source, policy: { rules: [], tools: [] } });

  const inForce = await findDefinitionsInForce(ctx.writer.db);

  expect(inForce?.persona).toBe('# Persona\n\nWarm,  \nbrief.\n');
});
