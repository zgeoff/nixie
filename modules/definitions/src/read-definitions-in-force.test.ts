import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWriter } from '@heynixie/log';
import { createPathSource } from './create-path-source';
import { readDefinitionsInForce } from './read-definitions-in-force';
import { runSeed } from './run-seed';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-in-force-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const root = join(directory, 'definitions');

  const writer = await startWriter({ dataDir: directory });

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
    source: createPathSource({ directory: root }),
  };
}

test('it finds nothing before the first seed', async () => {
  const ctx = await setupTest();
  const inForce = await readDefinitionsInForce(ctx.writer.db);

  expect(inForce).toBeNull();
});

test('it finds the definitions the newest seed put in force', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const policy = { rules: [], tools: [] };

  await runSeed({ log: ctx.log, source: ctx.source, buildPolicy: () => policy });
  await writeFile(join(ctx.root, 'persona.md'), '# Persona, edited\n');

  const newest = await runSeed({ log: ctx.log, source: ctx.source, buildPolicy: () => policy });
  const inForce = await readDefinitionsInForce(ctx.writer.db);

  expect(inForce).toStrictEqual(newest.inForce);
});

test('it finds the persona text the newest seed holds', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n\nWarm,  \nbrief.\n\n');

  await runSeed({
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  const inForce = await readDefinitionsInForce(ctx.writer.db);

  expect(inForce?.persona).toBe('# Persona\n\nWarm,  \nbrief.\n');
});
