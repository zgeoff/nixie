import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPathSource, runSeed } from '@heynixie/definitions';
import { readRecords, startWriter } from '@heynixie/log';
import { loadOrPinTaskSkills } from './load-or-pin-task-skills';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-task-skills-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const root = join(directory, 'definitions');

  const writer = await startWriter({ dataDir: directory });

  stack.defer(() => writer.stop());

  await mkdir(join(root, 'skills'), { recursive: true });

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  return {
    root,
    log: { writer, deploymentKey, projections: [] },
    source: createPathSource({ directory: root }),
  };
}

test('it keeps a task on the skill version it first loaded after a seed changes the skill', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.root, 'skills', 'tide-tables'));
  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'),
    '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n',
  );

  const policy = { rules: [], tools: [] };

  const first = await runSeed({ log: ctx.log, source: ctx.source, policy });

  await loadOrPinTaskSkills(ctx.log, {
    thread: 'conversation',
    inForce: first.inForce,
    list: first.inForce?.conversationSkills ?? [],
  });

  await writeFile(
    join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'),
    '---\nname: tide-tables\ndescription: Reads a tide table by port.\n---\n# Tides by port\n',
  );

  const second = await runSeed({ log: ctx.log, source: ctx.source, policy });

  const skills = await loadOrPinTaskSkills(ctx.log, {
    thread: 'conversation',
    inForce: second.inForce,
    list: second.inForce?.conversationSkills ?? [],
  });

  expect(skills.map((skill) => skill.files.get('SKILL.md'))).toStrictEqual([
    '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n',
  ]);
});

test('it pins a task on its first load to the skills on its list, and records the pin', async () => {
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

  const seeded = await runSeed({
    log: ctx.log,
    source: ctx.source,
    policy: { rules: [], tools: [] },
  });

  const tideTables = seeded.inForce?.skills.find((skill) => skill.name === 'tide-tables');

  const skills = await loadOrPinTaskSkills(ctx.log, {
    thread: 'task-a',
    inForce: seeded.inForce,
    list: ['tide-tables'],
  });

  const pins = await readRecords(ctx.log, { afterSequence: 0, kinds: ['skills.pinned'] });

  expect(skills.map((skill) => skill.name)).toStrictEqual(['tide-tables']);

  expect(pins.map((entry) => entry.record)).toMatchObject([
    {
      thread: 'task-a',
      definitions: { snapshotHash: seeded.inForce?.snapshotHash },
      payload: {
        skills: [{ name: 'tide-tables', skillHash: tideTables?.skillHash, origin: 'definitions' }],
      },
    },
  ]);
});

test("it pins a task that first loads after a seed to the new version, apart from another task's pin", async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.root, 'skills', 'tide-tables'));
  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'),
    '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n',
  );

  const policy = { rules: [], tools: [] };

  const first = await runSeed({ log: ctx.log, source: ctx.source, policy });

  await loadOrPinTaskSkills(ctx.log, {
    thread: 'task-a',
    inForce: first.inForce,
    list: ['tide-tables'],
  });

  await writeFile(
    join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'),
    '---\nname: tide-tables\ndescription: Reads a tide table by port.\n---\n# Tides by port\n',
  );

  const second = await runSeed({ log: ctx.log, source: ctx.source, policy });

  const taskA = await loadOrPinTaskSkills(ctx.log, {
    thread: 'task-a',
    inForce: second.inForce,
    list: ['tide-tables'],
  });

  const taskB = await loadOrPinTaskSkills(ctx.log, {
    thread: 'task-b',
    inForce: second.inForce,
    list: ['tide-tables'],
  });

  expect(taskA.map((skill) => skill.files.get('SKILL.md'))).toStrictEqual([
    '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n',
  ]);

  expect(taskB.map((skill) => skill.files.get('SKILL.md'))).toStrictEqual([
    '---\nname: tide-tables\ndescription: Reads a tide table by port.\n---\n# Tides by port\n',
  ]);
});

test('it gives a task no skills and records no pin before the first seed', async () => {
  const ctx = await setupTest();

  const skills = await loadOrPinTaskSkills(ctx.log, {
    thread: 'conversation',
    inForce: null,
    list: [],
  });

  const pins = await readRecords(ctx.log, { afterSequence: 0, kinds: ['skills.pinned'] });

  expect(skills).toStrictEqual([]);
  expect(pins).toStrictEqual([]);
});
