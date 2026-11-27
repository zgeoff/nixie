import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWriter } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { createPathSource } from '../definition/create-path-source';
import { runSeed } from '../rule/run-seed';
import { readSnapshotPolicy } from '../snapshot/read-snapshot-policy';
import { buildTestTaskSeed } from './build-test-task-seed';
import { buildTestToolDeclaration } from './build-test-tool-declaration';
import { seedLegacySnapshotContacts } from './seed-legacy-snapshot-contacts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-snapshot-policy-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const writer = await startWriter({ dataDir: directory });

  onTestFinished(() => writer.stop());

  const root = join(directory, 'definitions');

  await mkdir(root);
  await writeFile(join(root, 'nixie.yaml'), 'format: 7\n');
  await writeFile(join(root, 'persona.md'), '# Persona\n');

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  return {
    writer,
    runPolicySeed: async (flagged: boolean) => {
      const tool = {
        ...buildTestToolDeclaration('notes.send'),
        ...(flagged ? { requiresDestination: true as const } : {}),
      };

      const result = await runSeed({
        tasks: buildTestTaskSeed(),
        log: { writer, deploymentKey, projections: [] },
        source: createPathSource({ directory: root }),
        buildPolicy: () => ({ rules: [{ id: 'allow-reads' }], tools: [tool] }),
      });

      invariant(result.status === 'seeded');

      return result.inForce.snapshotHash;
    },
    readPolicy: (snapshotHash: string) => readSnapshotPolicy(writer.db, snapshotHash),
  };
}

test('it reads the contacts of an older snapshot as places at known', async () => {
  const ctx = await setupTest();
  const hash = await ctx.runPolicySeed(false);

  await seedLegacySnapshotContacts(ctx.writer.db, ['c-1', 'c-2']);

  const read = await ctx.readPolicy(hash);

  expect(read.places).toStrictEqual([
    { placeID: 'c-1', trust: 'known' },
    { placeID: 'c-2', trust: 'known' },
  ]);
});
