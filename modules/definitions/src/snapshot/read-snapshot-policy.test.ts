import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWriter } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { createPathSource } from '../definition/create-path-source';
import { runSeed } from '../rule/run-seed';
import { buildTestTaskSeed } from '../test-utils/build-test-task-seed';
import { buildTestToolDeclaration } from '../test-utils/build-test-tool-declaration';
import { readSnapshotPolicy } from './read-snapshot-policy';

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

test('it reads no place from a snapshot that lists none', async () => {
  const ctx = await setupTest();
  const hash = await ctx.runPolicySeed(false);
  const read = await ctx.readPolicy(hash);

  expect(read.places).toStrictEqual([]);
});

test('it keeps the requirement of a destination that a tool declared', async () => {
  const ctx = await setupTest();
  const hash = await ctx.runPolicySeed(true);
  const read = await ctx.readPolicy(hash);

  expect(read.tools.get('notes.send')?.requiresDestination).toBe(true);
});
