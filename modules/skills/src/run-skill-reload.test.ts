import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPathSource, runSeed } from '@heynixie/definitions';
import { readRecords, startWriter } from '@heynixie/log';
import { loadOrPinTaskSkills } from './load-or-pin-task-skills';
import { runSkillReload } from './run-skill-reload';

// the writer's data directory holds the definitions root too, so one removal cleans up both
async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dir = await mkdtemp(join(tmpdir(), 'nixie-skill-reload-'));

  stack.defer(() => rm(dir, { recursive: true, force: true }));

  const root = join(dir, 'definitions');

  const writer = await startWriter({ dataDir: dir });

  stack.defer(() => writer.stop());

  await mkdir(join(root, 'skills'), { recursive: true });

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  return {
    root,
    log: { writer, deploymentKey, projections: [] },
    source: createPathSource({ dir: root }),
  };
}

test('it moves one skill to the version a fresh seed holds and records its old and new version', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.root, 'skills', 'tide-tables'));
  await mkdir(join(ctx.root, 'skills', 'bird-log'));
  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'),
    '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n',
  );

  await writeFile(
    join(ctx.root, 'skills', 'bird-log', 'SKILL.md'),
    '---\nname: bird-log\ndescription: Logs a bird sighting.\n---\n# Birds\n',
  );

  const policy = { rules: [], tools: [] };

  const first = await runSeed({ log: ctx.log, source: ctx.source, policy });

  const pinned = await loadOrPinTaskSkills(ctx.log, {
    thread: 'task-a',
    inForce: first.inForce,
    list: ['bird-log', 'tide-tables'],
  });

  await writeFile(
    join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'),
    '---\nname: tide-tables\ndescription: Reads a tide table by port.\n---\n# Tides by port\n',
  );

  await writeFile(
    join(ctx.root, 'skills', 'bird-log', 'SKILL.md'),
    '---\nname: bird-log\ndescription: Logs a bird sighting with its place.\n---\n# Birds\n',
  );

  const outcome = await runSkillReload(
    {
      log: ctx.log,
      readInForce: () => first.inForce,
      refreshDefinitions: () =>
        runSeed({ log: ctx.log, source: ctx.source, policy }).then((seeded) => seeded.inForce),
      readSkillList: () => ['bird-log', 'tide-tables'],
    },
    {
      runID: 'run-1',
      thread: 'task-a',
      tools: [],
      model: { model: 'test-model', profile: 'standard' },
    },
    'tide-tables',
  );

  const skills = await loadOrPinTaskSkills(ctx.log, {
    thread: 'task-a',
    inForce: first.inForce,
    list: ['bird-log', 'tide-tables'],
  });

  const reloads = await readRecords(ctx.log, { afterSequence: 0, kinds: ['skills.reloaded'] });

  const tideTables = pinned.find((skill) => skill.name === 'tide-tables');
  const newTideTables = skills.find((skill) => skill.name === 'tide-tables');

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      skills: [
        {
          name: 'tide-tables',
          oldVersion: tideTables?.skillHash ?? null,
          newVersion: newTideTables?.skillHash ?? null,
        },
      ],
    },
  });

  expect(skills.map((skill) => skill.files.get('SKILL.md'))).toStrictEqual([
    '---\nname: bird-log\ndescription: Logs a bird sighting.\n---\n# Birds\n',
    '---\nname: tide-tables\ndescription: Reads a tide table by port.\n---\n# Tides by port\n',
  ]);

  expect(reloads.map((entry) => entry.record.payload)).toMatchObject([
    {
      changes: [
        {
          name: 'tide-tables',
          oldHash: tideTables?.skillHash ?? null,
          newHash: newTideTables?.skillHash ?? null,
        },
      ],
    },
  ]);
});

test('it moves both skills when 2 reloads of one thread name different skills at once', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.root, 'skills', 'tide-tables'));
  await mkdir(join(ctx.root, 'skills', 'bird-log'));
  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'),
    '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n',
  );

  await writeFile(
    join(ctx.root, 'skills', 'bird-log', 'SKILL.md'),
    '---\nname: bird-log\ndescription: Logs a bird sighting.\n---\n# Birds\n',
  );

  const policy = { rules: [], tools: [] };

  const first = await runSeed({ log: ctx.log, source: ctx.source, policy });

  await loadOrPinTaskSkills(ctx.log, {
    thread: 'task-a',
    inForce: first.inForce,
    list: ['bird-log', 'tide-tables'],
  });

  await writeFile(
    join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'),
    '---\nname: tide-tables\ndescription: Reads a tide table by port.\n---\n# Tides by port\n',
  );

  await writeFile(
    join(ctx.root, 'skills', 'bird-log', 'SKILL.md'),
    '---\nname: bird-log\ndescription: Logs a bird sighting with its place.\n---\n# Birds by place\n',
  );

  const context = {
    log: ctx.log,
    readInForce: () => first.inForce,
    refreshDefinitions: async () => {
      const seeded = await runSeed({ log: ctx.log, source: ctx.source, policy });

      return seeded.inForce;
    },
    readSkillList: () => ['bird-log', 'tide-tables'],
  };

  const run = {
    runID: 'run-1',
    thread: 'task-a',
    tools: [],
    model: { model: 'test-model', profile: 'standard' as const },
  };

  await Promise.all([
    runSkillReload(context, run, 'tide-tables'),
    runSkillReload(context, run, 'bird-log'),
  ]);

  const skills = await loadOrPinTaskSkills(ctx.log, {
    thread: 'task-a',
    inForce: first.inForce,
    list: ['bird-log', 'tide-tables'],
  });

  expect(skills.map((skill) => skill.files.get('SKILL.md'))).toStrictEqual([
    '---\nname: bird-log\ndescription: Logs a bird sighting with its place.\n---\n# Birds by place\n',
    '---\nname: tide-tables\ndescription: Reads a tide table by port.\n---\n# Tides by port\n',
  ]);
});

test('it moves every skill, joins one the list gained and drops one the definitions lost', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.root, 'skills', 'tide-tables'));
  await mkdir(join(ctx.root, 'skills', 'bird-log'));
  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'),
    '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n',
  );

  await writeFile(
    join(ctx.root, 'skills', 'bird-log', 'SKILL.md'),
    '---\nname: bird-log\ndescription: Logs a bird sighting.\n---\n# Birds\n',
  );

  const policy = { rules: [], tools: [] };

  const first = await runSeed({ log: ctx.log, source: ctx.source, policy });

  await loadOrPinTaskSkills(ctx.log, {
    thread: 'task-a',
    inForce: first.inForce,
    list: ['bird-log'],
  });

  await rm(join(ctx.root, 'skills', 'bird-log'), { recursive: true });

  const outcome = await runSkillReload(
    {
      log: ctx.log,
      readInForce: () => first.inForce,
      refreshDefinitions: () =>
        runSeed({ log: ctx.log, source: ctx.source, policy }).then((seeded) => seeded.inForce),
      readSkillList: () => ['bird-log', 'tide-tables'],
    },
    {
      runID: 'run-1',
      thread: 'task-a',
      tools: [],
      model: { model: 'test-model', profile: 'standard' },
    },
    null,
  );

  const skills = await loadOrPinTaskSkills(ctx.log, {
    thread: 'task-a',
    inForce: first.inForce,
    list: ['bird-log', 'tide-tables'],
  });

  const firstSkills = first.inForce?.skills ?? [];

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      skills: [
        {
          name: 'bird-log',
          oldVersion: firstSkills.find((skill) => skill.name === 'bird-log')?.skillHash ?? null,
          newVersion: null,
        },
        {
          name: 'tide-tables',
          oldVersion: null,
          newVersion: firstSkills.find((skill) => skill.name === 'tide-tables')?.skillHash ?? null,
        },
      ],
    },
  });

  expect(skills.map((skill) => skill.name)).toStrictEqual(['tide-tables']);
});

test("it drops a pinned skill that left the caller's list when a reload names it", async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.root, 'skills', 'tide-tables'));
  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'),
    '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n',
  );

  const policy = { rules: [], tools: [] };

  const seeded = await runSeed({ log: ctx.log, source: ctx.source, policy });

  await loadOrPinTaskSkills(ctx.log, {
    thread: 'task-a',
    inForce: seeded.inForce,
    list: ['tide-tables'],
  });

  const outcome = await runSkillReload(
    {
      log: ctx.log,
      readInForce: () => seeded.inForce,
      refreshDefinitions: () => Promise.resolve(seeded.inForce),
      readSkillList: () => [],
    },
    {
      runID: 'run-1',
      thread: 'task-a',
      tools: [],
      model: { model: 'test-model', profile: 'standard' },
    },
    'tide-tables',
  );

  const skills = await loadOrPinTaskSkills(ctx.log, {
    thread: 'task-a',
    inForce: seeded.inForce,
    list: [],
  });

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      skills: [
        {
          name: 'tide-tables',
          oldVersion: seeded.inForce?.skills[0]?.skillHash ?? null,
          newVersion: null,
        },
      ],
    },
  });

  expect(skills).toStrictEqual([]);
});

test("it refuses a skill that is neither pinned nor on the caller's list, and records no reload", async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.root, 'skills', 'tide-tables'));
  await mkdir(join(ctx.root, 'skills', 'bird-log'));
  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'),
    '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n',
  );

  await writeFile(
    join(ctx.root, 'skills', 'bird-log', 'SKILL.md'),
    '---\nname: bird-log\ndescription: Logs a bird sighting.\n---\n# Birds\n',
  );

  const policy = { rules: [], tools: [] };

  const seeded = await runSeed({ log: ctx.log, source: ctx.source, policy });

  const outcome = await runSkillReload(
    {
      log: ctx.log,
      readInForce: () => seeded.inForce,
      refreshDefinitions: () => Promise.resolve(seeded.inForce),
      readSkillList: () => ['tide-tables'],
    },
    {
      runID: 'run-1',
      thread: 'task-a',
      tools: [],
      model: { model: 'test-model', profile: 'standard' },
    },
    'bird-log',
  );

  const reloads = await readRecords(ctx.log, { afterSequence: 0, kinds: ['skills.reloaded'] });

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'the skill bird-log is not on your skill list',
  });

  expect(reloads).toStrictEqual([]);
});

test('it fails a reload before the first seed', async () => {
  const ctx = await setupTest();

  const outcome = await runSkillReload(
    {
      log: ctx.log,
      readInForce: () => null,
      refreshDefinitions: () => Promise.resolve(null),
      readSkillList: () => [],
    },
    {
      runID: 'run-1',
      thread: 'task-a',
      tools: [],
      model: { model: 'test-model', profile: 'standard' },
    },
    null,
  );

  expect(outcome).toStrictEqual({ status: 'error', message: 'no definitions are in force yet' });
});
