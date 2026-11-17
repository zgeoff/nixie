import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWriter } from '@heynixie/log';
import { startedTaskDefaultTools } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { createPathSource } from '../definition/create-path-source';
import { runSeed } from '../rule/run-seed';
import { buildTestTaskSeed } from '../test-utils/build-test-task-seed';
import { readListedDefinitions } from './read-listed-definitions';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-listed-definitions-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const root = join(directory, 'definitions');

  const writer = await startWriter({ dataDir: directory });

  stack.defer(() => writer.stop());

  await mkdir(root);
  await writeFile(join(root, 'nixie.yaml'), 'format: 4\n');
  await writeFile(join(root, 'persona.md'), '# Persona\n');

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  const log = { writer, deploymentKey, projections: [] };
  const source = createPathSource({ directory: root });

  return {
    readListed: () => readListedDefinitions(writer.db),
    writeTask: async (id: string, yaml: string) => {
      await mkdir(join(root, 'tasks', id), { recursive: true });
      await writeFile(join(root, 'tasks', id, 'task.yaml'), yaml);
    },
    runSeed: async () => {
      const result = await runSeed({
        tasks: buildTestTaskSeed(),
        log,
        source,
        buildPolicy: () => ({ rules: [], tools: [] }),
      });

      invariant(result.status === 'seeded');

      return result.record.sequence;
    },
  };
}

test('it lists nothing with no seed in force', async () => {
  const ctx = await setupTest();
  const listed = await ctx.readListed();

  expect(listed).toStrictEqual([]);
});

test('it lists each definition of the seed with its form and the seed that put it in force', async () => {
  const ctx = await setupTest();

  await ctx.writeTask(
    'call-the-vet',
    'name: Call the vet\nbrief: Book the check-up.\ntrigger:\n  at: "2027-03-09T14:00:00+11:00"\n',
  );

  await ctx.writeTask(
    'water-the-tomatoes',
    'name: Water the tomatoes\nbrief: Water the beds.\nenabled: false\ntrigger:\n  schedule:\n    every: day\n    at: "08:00"\n    zone: owner\n',
  );

  const seeded = await ctx.runSeed();
  const listed = await ctx.readListed();

  expect(listed).toStrictEqual([
    {
      definitionID: 'call-the-vet',
      definitionHash: expect.toBeString(),
      name: 'Call the vet',
      enabled: true,
      trigger: { at: '2027-03-09T14:00:00+11:00' },
      tools: [...startedTaskDefaultTools],
      origin: 'definitions',
      createdBy: { sequence: seeded, kind: 'definitions_seeded' },
      isUnreadable: false,
    },
    {
      definitionID: 'water-the-tomatoes',
      definitionHash: expect.toBeString(),
      name: 'Water the tomatoes',
      enabled: false,
      trigger: { schedule: { every: 'day', at: '08:00', zone: 'owner', catchUp: 'once' } },
      tools: [...startedTaskDefaultTools],
      origin: 'definitions',
      createdBy: { sequence: seeded, kind: 'definitions_seeded' },
      isUnreadable: false,
    },
  ]);
});

test('it names the first seed of the run that holds the version in force', async () => {
  const ctx = await setupTest();

  await ctx.writeTask('water-the-tomatoes', 'name: Water the tomatoes\nbrief: Water the beds.\n');

  const first = await ctx.runSeed();

  await ctx.writeTask('prune-the-roses', 'name: Prune the roses\nbrief: Cut the dead wood.\n');

  const second = await ctx.runSeed();
  const listed = await ctx.readListed();

  expect(
    listed.map((definition) => [definition.definitionID, definition.createdBy.sequence]),
  ).toStrictEqual([
    ['prune-the-roses', second],
    ['water-the-tomatoes', first],
  ]);
});

test('it names the newest seed for a definition that changed since an older seed', async () => {
  const ctx = await setupTest();

  await ctx.writeTask('water-the-tomatoes', 'name: Water the tomatoes\nbrief: Water the beds.\n');
  await ctx.runSeed();
  await ctx.writeTask('water-the-tomatoes', 'name: Water the tomatoes\nbrief: Water the pots.\n');

  const second = await ctx.runSeed();
  const [listed] = await ctx.readListed();

  expect(listed?.createdBy.sequence).toBe(second);
});
