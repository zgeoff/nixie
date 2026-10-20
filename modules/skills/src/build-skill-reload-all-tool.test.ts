import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPathSource, loadSkillVersions, runSeed } from '@heynixie/definitions';
import { startWriter } from '@heynixie/log';
import { buildTestClock } from '@heynixie/testing';
import { buildToolRegistry } from '@heynixie/tools';
import invariant from 'tiny-invariant';
import { buildSkillReloadAllTool } from './build-skill-reload-all-tool';
import { loadSkillPin } from './load-skill-pin';

// the writer's data directory holds the definitions root too, so one removal cleans up both
async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-skill-reload-all-'));

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

test('it reloads every skill on the list, with a result the output schema accepts', async () => {
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

  const registry = buildToolRegistry([
    buildSkillReloadAllTool({
      log: ctx.log,
      clock: buildTestClock(0),
      readInForce: () => seeded.inForce,
      refreshDefinitions: () => Promise.resolve(seeded.inForce),
      readSkillList: () => ['bird-log', 'tide-tables'],
    }),
  ]);

  const tool = registry.findTool('skill_reload_all');

  invariant(tool);

  const outcome = await tool.definition.run(
    { callID: 'call-1', tool: 'skill_reload_all', input: {}, toolUseID: null },
    {
      run: {
        runID: 'run-1',
        thread: 'task-a',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  invariant(outcome.status === 'ok');

  expect(outcome.result).toStrictEqual({
    skills: [
      {
        name: 'bird-log',
        oldVersion:
          seeded.inForce?.skills.find((skill) => skill.name === 'bird-log')?.skillHash ?? null,
        newVersion:
          seeded.inForce?.skills.find((skill) => skill.name === 'bird-log')?.skillHash ?? null,
      },
      {
        name: 'tide-tables',
        oldVersion:
          seeded.inForce?.skills.find((skill) => skill.name === 'tide-tables')?.skillHash ?? null,
        newVersion:
          seeded.inForce?.skills.find((skill) => skill.name === 'tide-tables')?.skillHash ?? null,
      },
    ],
  });

  expect(tool.parseOutput(outcome.result)).toStrictEqual({ isValid: true });
});

test('it moves a pinned skill to the version a later seed put in force', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.root, 'skills', 'tide-tables'));
  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'),
    '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n',
  );

  const first = await runSeed({
    log: ctx.log,
    source: ctx.source,
    policy: { rules: [], tools: [] },
  });

  const tool = buildSkillReloadAllTool({
    log: ctx.log,
    clock: buildTestClock(0),
    readInForce: () => first.inForce,
    refreshDefinitions: async () => {
      const seeded = await runSeed({
        log: ctx.log,
        source: ctx.source,
        policy: { rules: [], tools: [] },
      });

      return seeded.inForce;
    },
    readSkillList: () => ['tide-tables'],
  });

  const call = { callID: 'call-1', tool: 'skill_reload_all', input: {}, toolUseID: null };

  const run = {
    run: {
      runID: 'run-1',
      thread: 'task-a',
      tools: [],
      model: { model: 'test-model', profile: 'standard' },
    },
  };

  await tool.run(call, run);

  await writeFile(
    join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'),
    '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides, by port\n',
  );

  const outcome = await tool.run(call, run);
  const pin = await loadSkillPin(ctx.log, 'task-a');

  const oldVersion = first.inForce?.skills[0]?.skillHash;
  const newVersion = pin?.[0]?.skillHash;

  invariant(oldVersion !== undefined && newVersion !== undefined);

  const versions = await loadSkillVersions(ctx.log.writer.db, [newVersion]);

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: { skills: [{ name: 'tide-tables', oldVersion, newVersion }] },
  });

  expect(newVersion).not.toBe(oldVersion);

  expect(versions.get(newVersion)?.files.get('SKILL.md')).toBe(
    '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides, by port\n',
  );
});
