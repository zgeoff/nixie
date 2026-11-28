import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPathSource, runSeed } from '@heynixie/definitions';
import { buildTestTaskSeed } from '@heynixie/definitions/test-utils';
import { startWriter } from '@heynixie/log';
import { joinListedSkills } from './join-listed-skills';
import { loadOrPinTaskSkills } from './load-or-pin-task-skills';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-join-skills-'));

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

test('it gives a second run the skill its definition added to the list after the first run pinned', async () => {
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
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  await joinListedSkills(ctx.log, {
    thread: 'task-a',
    inForce: seeded.inForce,
    list: ['tide-tables'],
  });

  await joinListedSkills(ctx.log, {
    thread: 'task-a',
    inForce: seeded.inForce,
    list: ['bird-log', 'tide-tables'],
  });

  const skills = await loadOrPinTaskSkills(ctx.log, {
    thread: 'task-a',
    inForce: seeded.inForce,
    list: ['bird-log', 'tide-tables'],
    isRestricted: true,
  });

  expect(skills.map((skill) => skill.name)).toStrictEqual(['bird-log', 'tide-tables']);
});

test('it leaves out of a run the skill its definition took off the list', async () => {
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
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  await joinListedSkills(ctx.log, {
    thread: 'task-a',
    inForce: seeded.inForce,
    list: ['bird-log', 'tide-tables'],
  });

  const skills = await loadOrPinTaskSkills(ctx.log, {
    thread: 'task-a',
    inForce: seeded.inForce,
    list: ['tide-tables'],
    isRestricted: true,
  });

  expect(skills.map((skill) => skill.name)).toStrictEqual(['tide-tables']);
});
