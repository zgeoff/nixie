import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWriter } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { buildDefinitionsSnapshot } from './build-definitions-snapshot';
import { createPathSource } from './create-path-source';
import { findResetSeed } from './find-reset-seed';
import { runSeed } from './run-seed';

// the writer's data directory holds the definitions root too, so one removal cleans up both
async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dir = await mkdtemp(join(tmpdir(), 'nixie-reset-seed-'));

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
  const seed = await findResetSeed(ctx.writer.db);

  expect(seed).toBeNull();
});

test('it reads the seed in force with its snapshot row and the payload of its record', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 1\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n\nCalm and short.\n');

  const policy = { rules: [{ id: 'slice1.read-only' }], tools: [] };

  const seeded = await runSeed({ log: ctx.log, source: ctx.source, policy });

  const built = buildDefinitionsSnapshot({ persona: '# Persona\n\nCalm and short.\n', policy });

  const seed = await findResetSeed(ctx.writer.db);

  invariant(seeded.inForce);

  expect(seed).toStrictEqual({
    inForce: seeded.inForce,
    policyHash: built.policyHash,
    form: built.form,
    label: seeded.inForce.revision,
    createdAt: seeded.inForce.seededAt.getTime(),
    payload: {
      sourceID: `path:${ctx.root}`,
      sourceKind: 'path',
      revision: seeded.inForce.revision,
      contentHash: seeded.inForce.contentHash,
      formatVersion: 1,
      policyHash: built.policyHash,
      unapplied: [],
      skipped: [],
    },
  });
});
