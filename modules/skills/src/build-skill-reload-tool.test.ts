import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPathSource, runSeed } from '@heynixie/definitions';
import { startWriter } from '@heynixie/log';
import { buildTestClock } from '@heynixie/testing';
import { buildToolRegistry } from '@heynixie/tools';
import invariant from 'tiny-invariant';
import { buildSkillReloadTool } from './build-skill-reload-tool';

// the writer's data directory holds the definitions root too, so one removal cleans up both
async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-skill-reload-tool-'));

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

test('it reloads the skill its input names, with a result the output schema accepts', async () => {
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
    buildSkillReloadTool({
      log: ctx.log,
      clock: buildTestClock(0),
      readInForce: () => seeded.inForce,
      refreshDefinitions: () => Promise.resolve(seeded.inForce),
      readSkillList: () => ['bird-log', 'tide-tables'],
    }),
  ]);

  const tool = registry.findTool('skill_reload');

  invariant(tool);

  const outcome = await tool.definition.run(
    { callID: 'call-1', tool: 'skill_reload', input: { name: 'bird-log' }, toolUseID: null },
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
    ],
  });

  expect(tool.parseOutput(outcome.result)).toStrictEqual({ isValid: true });
});
