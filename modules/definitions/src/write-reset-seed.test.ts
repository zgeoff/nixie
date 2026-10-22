import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRecords, runLogReset, startWriter, withWriteTransaction } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { checkSkillFiles } from './check-skill-files';
import { createPathSource } from './create-path-source';
import { loadSnapshotSkills } from './load-snapshot-skills';
import { readDefinitionsInForce } from './read-definitions-in-force';
import { readResetSeed } from './read-reset-seed';
import { runSeed } from './run-seed';
import { runWrittenSkillSeed } from './run-written-skill-seed';
import { createStubGitSyncWorktree } from './test-utils/create-stub-git-sync-worktree';
import { writeResetSeed } from './write-reset-seed';
import { writeWrittenSkill } from './write-written-skill';
import { writeWrittenSkillState } from './write-written-skill-state';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-reset-seed-'));

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
    directory,
    root,
    writer,
    log: { writer, deploymentKey, projections: [] },
    source: createPathSource({ directory: root }),
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
    readKept: (tx) => readResetSeed(tx),
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
    readKept: (tx) => readResetSeed(tx),
    writeFirstRecords: async (tx, seed) => {
      invariant(seed);

      await writeResetSeed(tx, ctx.log, seed);
    },
  });

  const after = await readResetSeed(ctx.writer.db);

  invariant(seeded.inForce);

  expect(after?.inForce).toStrictEqual({
    ...seeded.inForce,
    seededAt: expect.toBeValidDate(),
    recordSequence: 2,
  });
});

test('it keeps the commit and the repository of a git-sync seed through a reset', async () => {
  const ctx = await setupTest();

  const sync = join(ctx.directory, 'sync');

  const worktree = await createStubGitSyncWorktree(sync, {
    commit: 'c7e2a9f4b1d6083e5a7c9f2b4d6e8a1c3f5b7d02',
    config: '[remote "origin"]\n\turl = https://git.example.test/puffin-co/auk-definitions\n',
  });

  await Promise.all([
    writeFile(join(worktree, 'nixie.yaml'), 'format: 1\n'),
    writeFile(join(worktree, 'persona.md'), '# Persona\n\nCalm and short.\n'),
  ]);

  const seeded = await runSeed({
    log: ctx.log,
    source: createPathSource({ directory: join(sync, 'current') }),
    policy: { rules: [], tools: [] },
  });

  await runLogReset(ctx.log, {
    keptTables: [],
    readKept: (tx) => readResetSeed(tx),
    writeFirstRecords: async (tx, seed) => {
      invariant(seed);

      await writeResetSeed(tx, ctx.log, seed);
    },
  });

  const after = await readDefinitionsInForce(ctx.writer.db);

  invariant(seeded.inForce);

  expect(after).toStrictEqual({
    ...seeded.inForce,
    seededAt: expect.toBeValidDate(),
    recordSequence: 2,
  });

  expect(after?.sourceRepository).toBe('https://git.example.test/puffin-co/auk-definitions');
  expect(after?.revision).toBe('c7e2a9f4b1d6083e5a7c9f2b4d6e8a1c3f5b7d02');
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
    readKept: (tx) => readResetSeed(tx),
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

test("it keeps a skill's frontmatter fields through a reset", async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.root, 'skills', 'tide-tables'), { recursive: true });

  await Promise.all([
    writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n'),
    writeFile(join(ctx.root, 'persona.md'), '# Persona\n\nCalm and short.\n'),
    writeFile(
      join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'),
      '---\nname: tide-tables\ndescription: Reads a tide table.\ncompatibility: Needs Python 3.\nmetadata:\n  team: harbour\n  version: "1.2"\n---\n# Tides\n',
    ),
  ]);

  const seeded = await runSeed({
    log: ctx.log,
    source: ctx.source,
    policy: { rules: [], tools: [] },
  });

  await runLogReset(ctx.log, {
    keptTables: [],
    readKept: (tx) => readResetSeed(tx),
    writeFirstRecords: async (tx, seed) => {
      invariant(seed);

      await writeResetSeed(tx, ctx.log, seed);
    },
  });

  invariant(seeded.inForce);

  const skills = await loadSnapshotSkills(ctx.writer.db, seeded.inForce.snapshotHash);

  expect(skills.map((skill) => skill.frontmatter)).toStrictEqual([
    {
      name: 'tide-tables',
      description: 'Reads a tide table.',
      license: null,
      compatibility: 'Needs Python 3.',
      allowedTools: null,
      metadata: { team: 'harbour', version: '1.2' },
    },
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

  const before = await readDefinitionsInForce(ctx.writer.db);

  await runLogReset(ctx.log, {
    keptTables: [],
    readKept: (tx) => readResetSeed(tx),
    writeFirstRecords: async (tx, seed) => {
      invariant(seed);

      await writeResetSeed(tx, ctx.log, seed);
    },
  });

  const after = await readDefinitionsInForce(ctx.writer.db);

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

  const before = await readDefinitionsInForce(ctx.writer.db);

  await runLogReset(ctx.log, {
    keptTables: [],
    readKept: (tx) => readResetSeed(tx),
    writeFirstRecords: async (tx, seed) => {
      invariant(seed);

      await writeResetSeed(tx, ctx.log, seed);
    },
  });

  const after = await readDefinitionsInForce(ctx.writer.db);

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
    readKept: (tx) => readResetSeed(tx),
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

test('it keeps a skill nixie wrote in force through a reset and the seed after it', async () => {
  const ctx = await setupTest();

  const text = '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n';

  await mkdir(join(ctx.root, 'skills', 'tide-tables'), { recursive: true });

  await Promise.all([
    writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n'),
    writeFile(join(ctx.root, 'persona.md'), '# Persona\n'),
    writeFile(join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'), text),
  ]);

  const policy = { rules: [], tools: [] };

  await runSeed({ log: ctx.log, source: ctx.source, policy });

  const skill = checkSkillFiles('tide-tables', [{ path: 'SKILL.md', text: `${text}By port.\n` }]);

  invariant('skillHash' in skill);

  await withWriteTransaction(ctx.writer, (tx) =>
    writeWrittenSkill(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      proposalID: 'k3vq8m2xpa',
      skill,
      approvedAt: 1,
    }),
  );

  await runWrittenSkillSeed({ log: ctx.log, policy });

  await runLogReset(ctx.log, {
    keptTables: [],
    readKept: (tx) => readResetSeed(tx),
    writeFirstRecords: async (tx, seed) => {
      invariant(seed);

      await writeResetSeed(tx, ctx.log, seed);
    },
  });

  const next = await runSeed({ log: ctx.log, source: ctx.source, policy });

  expect(next.status).toBe('unchanged');

  expect(next.inForce?.skills).toStrictEqual([
    { name: 'tide-tables', skillHash: skill.skillHash, origin: 'nixie' },
  ]);
});

test('it keeps a skill nixie wrote through a reset before its seed, and the seed after it puts it in force', async () => {
  const ctx = await setupTest();

  const text = '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n';

  await mkdir(join(ctx.root, 'skills', 'tide-tables'), { recursive: true });

  await Promise.all([
    writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n'),
    writeFile(join(ctx.root, 'persona.md'), '# Persona\n'),
    writeFile(join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'), text),
  ]);

  const policy = { rules: [], tools: [] };

  await runSeed({ log: ctx.log, source: ctx.source, policy });

  const skill = checkSkillFiles('tide-tables', [{ path: 'SKILL.md', text: `${text}By port.\n` }]);

  invariant('skillHash' in skill);

  await withWriteTransaction(ctx.writer, (tx) =>
    writeWrittenSkill(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      proposalID: 'k3vq8m2xpa',
      skill,
      approvedAt: 1,
    }),
  );

  await runLogReset(ctx.log, {
    keptTables: [],
    readKept: (tx) => readResetSeed(tx),
    writeFirstRecords: async (tx, seed) => {
      invariant(seed);

      await writeResetSeed(tx, ctx.log, seed);
    },
  });

  const seeded = await runWrittenSkillSeed({ log: ctx.log, policy });

  expect(seeded.inForce?.skills).toStrictEqual([
    { name: 'tide-tables', skillHash: skill.skillHash, origin: 'nixie' },
  ]);
});

test("it puts your definitions' version back after a reset when you retire nixie's", async () => {
  const ctx = await setupTest();

  const text = '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n';

  await mkdir(join(ctx.root, 'skills', 'tide-tables'), { recursive: true });

  await Promise.all([
    writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n'),
    writeFile(join(ctx.root, 'persona.md'), '# Persona\n'),
    writeFile(join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'), text),
  ]);

  const policy = { rules: [], tools: [] };

  const first = await runSeed({ log: ctx.log, source: ctx.source, policy });

  const skill = checkSkillFiles('tide-tables', [{ path: 'SKILL.md', text: `${text}By port.\n` }]);

  invariant('skillHash' in skill);

  await withWriteTransaction(ctx.writer, (tx) =>
    writeWrittenSkill(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      proposalID: 'k3vq8m2xpa',
      skill,
      approvedAt: 1,
    }),
  );

  await runWrittenSkillSeed({ log: ctx.log, policy });

  await runLogReset(ctx.log, {
    keptTables: [],
    readKept: (tx) => readResetSeed(tx),
    writeFirstRecords: async (tx, seed) => {
      invariant(seed);

      await writeResetSeed(tx, ctx.log, seed);
    },
  });

  await withWriteTransaction(ctx.writer, (tx) =>
    writeWrittenSkillState(tx, {
      approvalID: '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
      to: 'retired',
      at: 2,
    }),
  );

  const retired = await runWrittenSkillSeed({ log: ctx.log, policy });

  expect(retired.inForce?.skills).toStrictEqual(first.inForce?.skills);
});
