import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRecords, runLogReset, startWriter } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { createPathSource } from './create-path-source';
import { findDefinitionsInForce } from './find-definitions-in-force';
import { findResetSeed } from './find-reset-seed';
import { loadSnapshotSkills } from './load-snapshot-skills';
import { runSeed } from './run-seed';
import { writeResetSeed } from './write-reset-seed';

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

test('it seeds the definitions in force again as the first record of the new log', async () => {
  const ctx = await setupTest();

  await Promise.all([
    writeFile(join(ctx.root, 'nixie.yaml'), 'format: 1\n'),
    writeFile(join(ctx.root, 'persona.md'), '# Persona\n\nCalm and short.\n'),
  ]);

  const seeded = await runSeed({
    log: ctx.log,
    source: ctx.source,
    policy: { rules: [], tools: [] },
  });

  await runLogReset(ctx.log, {
    keptTables: [],
    readKept: (tx) => findResetSeed(tx),
    writeFirstRecords: async (tx, seed) => {
      invariant(seed);

      await writeResetSeed(tx, ctx.log, seed);
    },
  });

  const read = await readRecords(ctx.log, { afterSequence: 0 });

  invariant(seeded.status === 'seeded');

  expect(read.map((entry) => entry.record)).toStrictEqual([
    { ...seeded.record, sequence: 2, recordedAt: expect.toBeValidDate() },
  ]);
});

test('it puts the same definitions in force under the new record', async () => {
  const ctx = await setupTest();

  await Promise.all([
    writeFile(join(ctx.root, 'nixie.yaml'), 'format: 1\n'),
    writeFile(join(ctx.root, 'persona.md'), '# Persona\n\nCalm and short.\n'),
  ]);

  const seeded = await runSeed({
    log: ctx.log,
    source: ctx.source,
    policy: { rules: [], tools: [] },
  });

  await runLogReset(ctx.log, {
    keptTables: [],
    readKept: (tx) => findResetSeed(tx),
    writeFirstRecords: async (tx, seed) => {
      invariant(seed);

      await writeResetSeed(tx, ctx.log, seed);
    },
  });

  const after = await findResetSeed(ctx.writer.db);

  invariant(seeded.inForce);

  expect(after?.inForce).toStrictEqual({
    ...seeded.inForce,
    seededAt: expect.toBeValidDate(),
    recordSequence: 2,
  });
});

test('it seeds the skills in force again with their files', async () => {
  const ctx = await setupTest();

  const skill = '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n';

  await mkdir(join(ctx.root, 'skills', 'tide-tables'), { recursive: true });

  await Promise.all([
    writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n'),
    writeFile(join(ctx.root, 'persona.md'), '# Persona\n\nCalm and short.\n'),
    writeFile(join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'), skill),
  ]);

  const seeded = await runSeed({
    log: ctx.log,
    source: ctx.source,
    policy: { rules: [], tools: [] },
  });

  await runLogReset(ctx.log, {
    keptTables: [],
    readKept: (tx) => findResetSeed(tx),
    writeFirstRecords: async (tx, seed) => {
      invariant(seed);

      await writeResetSeed(tx, ctx.log, seed);
    },
  });

  const skills = await loadSnapshotSkills(ctx.writer.db, seeded.inForce?.snapshotHash ?? '');

  expect(skills).toMatchObject([
    { name: 'tide-tables', origin: 'definitions', files: new Map([['SKILL.md', skill]]) },
  ]);
});

test("it keeps the conversation's skill list through storage and a reset", async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.root, 'skills', 'tide-tables'), { recursive: true });
  await mkdir(join(ctx.root, 'skills', 'bird-log'), { recursive: true });

  await Promise.all([
    writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\nskills:\n  - tide-tables\n'),
    writeFile(join(ctx.root, 'persona.md'), '# Persona\n\nCalm and short.\n'),
    writeFile(
      join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'),
      '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n',
    ),
    writeFile(
      join(ctx.root, 'skills', 'bird-log', 'SKILL.md'),
      '---\nname: bird-log\ndescription: Logs a bird sighting.\n---\n# Birds\n',
    ),
  ]);

  await runSeed({ log: ctx.log, source: ctx.source, policy: { rules: [], tools: [] } });

  const before = await findDefinitionsInForce(ctx.writer.db);

  await runLogReset(ctx.log, {
    keptTables: [],
    readKept: (tx) => findResetSeed(tx),
    writeFirstRecords: async (tx, seed) => {
      invariant(seed);

      await writeResetSeed(tx, ctx.log, seed);
    },
  });

  const after = await findDefinitionsInForce(ctx.writer.db);

  expect(before?.conversationSkills).toStrictEqual(['tide-tables']);
  expect(after?.conversationSkills).toStrictEqual(['tide-tables']);
  expect(after?.skills.map((skill) => skill.name)).toStrictEqual(['bird-log', 'tide-tables']);
});

test('it keeps an empty conversation skill list through storage and a reset, beside the skill', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.root, 'skills', 'tide-tables'), { recursive: true });

  await Promise.all([
    writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\nskills: []\n'),
    writeFile(join(ctx.root, 'persona.md'), '# Persona\n\nCalm and short.\n'),
    writeFile(
      join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'),
      '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n',
    ),
  ]);

  await runSeed({ log: ctx.log, source: ctx.source, policy: { rules: [], tools: [] } });

  const before = await findDefinitionsInForce(ctx.writer.db);

  await runLogReset(ctx.log, {
    keptTables: [],
    readKept: (tx) => findResetSeed(tx),
    writeFirstRecords: async (tx, seed) => {
      invariant(seed);

      await writeResetSeed(tx, ctx.log, seed);
    },
  });

  const after = await findDefinitionsInForce(ctx.writer.db);

  expect(before?.conversationSkills).toStrictEqual([]);
  expect(after?.conversationSkills).toStrictEqual([]);
  expect(after?.skills.map((skill) => skill.name)).toStrictEqual(['tide-tables']);
});

test('it leaves the next seed of the same definitions unchanged', async () => {
  const ctx = await setupTest();

  await Promise.all([
    writeFile(join(ctx.root, 'nixie.yaml'), 'format: 1\n'),
    writeFile(join(ctx.root, 'persona.md'), '# Persona\n\nCalm and short.\n'),
  ]);

  await runSeed({ log: ctx.log, source: ctx.source, policy: { rules: [], tools: [] } });

  await runLogReset(ctx.log, {
    keptTables: [],
    readKept: (tx) => findResetSeed(tx),
    writeFirstRecords: async (tx, seed) => {
      invariant(seed);

      await writeResetSeed(tx, ctx.log, seed);
    },
  });

  const next = await runSeed({
    log: ctx.log,
    source: ctx.source,
    policy: { rules: [], tools: [] },
  });

  expect(next.status).toBe('unchanged');
});
