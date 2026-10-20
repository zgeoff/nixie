import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPathSource, runSeed } from '@heynixie/definitions';
import { startWriter } from '@heynixie/log';
import { buildTestClock } from '@heynixie/testing';
import { buildToolRegistry } from '@heynixie/tools';
import invariant from 'tiny-invariant';
import { buildSkillReadTool } from './build-skill-read-tool';

// the writer's data directory holds the definitions root too, so one removal cleans up both
async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-skill-read-'));

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

test('it returns the instructions without their frontmatter and the list of the other files', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.root, 'skills', 'tide-tables', 'references'), { recursive: true });
  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'),
    '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n',
  );

  await writeFile(join(ctx.root, 'skills', 'tide-tables', 'references', 'ports.md'), '# Ports\n');
  await writeFile(join(ctx.root, 'skills', 'tide-tables', 'convert.py'), 'print(1)\n');

  const seeded = await runSeed({
    log: ctx.log,
    source: ctx.source,
    policy: { rules: [], tools: [] },
  });

  const tool = buildSkillReadTool({
    log: ctx.log,
    clock: buildTestClock(0),
    readInForce: () => seeded.inForce,
    refreshDefinitions: () => Promise.resolve(seeded.inForce),
    readSkillList: () => ['tide-tables'],
  });

  const outcome = await tool.run(
    { callID: 'call-1', tool: 'skill_read', input: { name: 'tide-tables' }, toolUseID: null },
    {
      run: {
        runID: 'run-1',
        thread: 'conversation',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      skill: 'tide-tables',
      version: seeded.inForce?.skills[0]?.skillHash ?? null,
      text: '# Tides\n',
      files: ['convert.py', 'references/ports.md'],
    },
  });
});

test("it labels a skill's text and file list as untrusted, and its name and version as the owner's", async () => {
  const ctx = await setupTest();

  const registry = buildToolRegistry([
    buildSkillReadTool({
      log: ctx.log,
      clock: buildTestClock(0),
      readInForce: () => null,
      refreshDefinitions: () => Promise.resolve(null),
      readSkillList: () => [],
    }),
  ]);

  const tool = registry.findTool('skill_read');

  invariant(tool);

  expect(tool.definition.declaration.results).toStrictEqual({
    skill: 'owner_data',
    version: 'owner_data',
    text: 'untrusted',
    files: 'untrusted',
  });
});

test('it returns the file at a path inside the skill folder', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.root, 'skills', 'tide-tables', 'references'), { recursive: true });
  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'),
    '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n',
  );

  await writeFile(join(ctx.root, 'skills', 'tide-tables', 'references', 'ports.md'), '# Ports\n');

  const seeded = await runSeed({
    log: ctx.log,
    source: ctx.source,
    policy: { rules: [], tools: [] },
  });

  const tool = buildSkillReadTool({
    log: ctx.log,
    clock: buildTestClock(0),
    readInForce: () => seeded.inForce,
    refreshDefinitions: () => Promise.resolve(seeded.inForce),
    readSkillList: () => ['tide-tables'],
  });

  const outcome = await tool.run(
    {
      callID: 'call-1',
      tool: 'skill_read',
      input: { name: 'tide-tables', path: './references/ports.md' },
      toolUseID: null,
    },
    {
      run: {
        runID: 'run-1',
        thread: 'conversation',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      skill: 'tide-tables',
      version: seeded.inForce?.skills[0]?.skillHash ?? null,
      text: '# Ports\n',
      files: [],
    },
  });
});

test.each([
  ['a path that climbs out of the folder', '../bird-log/SKILL.md'],
  ['a path that climbs out through a subfolder', 'references/../../bird-log/SKILL.md'],
  ['an absolute path', '/etc/hostname'],
])('it refuses %s', async (_label, path) => {
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

  const tool = buildSkillReadTool({
    log: ctx.log,
    clock: buildTestClock(0),
    readInForce: () => seeded.inForce,
    refreshDefinitions: () => Promise.resolve(seeded.inForce),
    readSkillList: () => ['tide-tables'],
  });

  const outcome = await tool.run(
    { callID: 'call-1', tool: 'skill_read', input: { name: 'tide-tables', path }, toolUseID: null },
    {
      run: {
        runID: 'run-1',
        thread: 'conversation',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  expect(outcome).toStrictEqual({
    status: 'error',
    message: `the path ${path} is outside the skill's folder`,
  });
});

test('it refuses a path the skill has no file at', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.root, 'skills', 'tide-tables'));
  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'),
    '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n',
  );

  const seeded = await runSeed({
    log: ctx.log,
    source: ctx.source,
    policy: { rules: [], tools: [] },
  });

  const tool = buildSkillReadTool({
    log: ctx.log,
    clock: buildTestClock(0),
    readInForce: () => seeded.inForce,
    refreshDefinitions: () => Promise.resolve(seeded.inForce),
    readSkillList: () => ['tide-tables'],
  });

  const outcome = await tool.run(
    {
      callID: 'call-1',
      tool: 'skill_read',
      input: { name: 'tide-tables', path: 'ports.md' },
      toolUseID: null,
    },
    {
      run: {
        runID: 'run-1',
        thread: 'conversation',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'the skill tide-tables has no file at ports.md',
  });
});

test("it refuses a skill that is off the caller's skill list", async () => {
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

  const tool = buildSkillReadTool({
    log: ctx.log,
    clock: buildTestClock(0),
    readInForce: () => seeded.inForce,
    refreshDefinitions: () => Promise.resolve(seeded.inForce),
    readSkillList: () => ['tide-tables'],
  });

  const outcome = await tool.run(
    { callID: 'call-1', tool: 'skill_read', input: { name: 'bird-log' }, toolUseID: null },
    {
      run: {
        runID: 'run-1',
        thread: 'task-a',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'the skill bird-log is not on your skill list',
  });
});

test('it reads the version the task first loaded after a seed changes the skill', async () => {
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

  const firstTool = buildSkillReadTool({
    log: ctx.log,
    clock: buildTestClock(0),
    readInForce: () => first.inForce,
    refreshDefinitions: () => Promise.resolve(first.inForce),
    readSkillList: () => ['tide-tables'],
  });

  await firstTool.run(
    { callID: 'call-1', tool: 'skill_read', input: { name: 'tide-tables' }, toolUseID: null },
    {
      run: {
        runID: 'run-1',
        thread: 'task-a',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  await writeFile(
    join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'),
    '---\nname: tide-tables\ndescription: Reads a tide table by port.\n---\n# Tides by port\n',
  );

  const second = await runSeed({ log: ctx.log, source: ctx.source, policy });

  const secondTool = buildSkillReadTool({
    log: ctx.log,
    clock: buildTestClock(0),
    readInForce: () => second.inForce,
    refreshDefinitions: () => Promise.resolve(second.inForce),
    readSkillList: () => ['tide-tables'],
  });

  const outcome = await secondTool.run(
    { callID: 'call-2', tool: 'skill_read', input: { name: 'tide-tables' }, toolUseID: null },
    {
      run: {
        runID: 'run-1',
        thread: 'task-a',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      skill: 'tide-tables',
      version: first.inForce?.skills[0]?.skillHash ?? null,
      text: '# Tides\n',
      files: [],
    },
  });
});
