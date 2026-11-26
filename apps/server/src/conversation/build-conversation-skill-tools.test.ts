import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPathSource } from '@heynixie/definitions';
import { buildStubDefinitionsRepo, buildTestTaskSeed } from '@heynixie/definitions/test-utils';
import { buildTestRunSettings, buildTestTaskRunners } from '@heynixie/tasks/test-utils';
import { buildToolRegistry } from '@heynixie/tools';
import { createFakeClock } from '@zgeoff/testing/clock';
import invariant from 'tiny-invariant';
import { refreshDefinitions } from '../definition/refresh-definitions';
import { runDefinitionsSeed } from '../definition/run-definitions-seed';
import type { SeedParts } from '../seed/run-queued-seed';
import { createServerContext } from '../server/create-server-context';
import { startTestLog } from '../test-utils/start-test-log';
import { buildStartState } from '../utils/build-start-state';
import { buildConversationSkillTools } from './build-conversation-skill-tools';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-conversation-skills-'));

  stack.defer(() => rm(dataDir, { recursive: true, force: true }));

  const log = await startTestLog(dataDir);

  stack.defer(() => log.writer.stop());

  const root = join(dataDir, 'definitions');

  const context = await createServerContext(log.writer, log.deploymentKey, () => null, {
    runSettings: buildTestRunSettings(),
    taskRunLimits: { turns: 25, dollars: 2 },
    defaultZone: 'Europe/Lisbon',
    features: [],
    runners: buildTestTaskRunners(),
  });

  const parts: SeedParts = {
    context: context.apiContext,
    source: createPathSource({ directory: root }),
    tasks: buildTestTaskSeed(),
    buildPolicy: () => ({ rules: [], tools: [] }),
    inForce: context.inForce,
    state: buildStartState({ isReady: true, reason: null }),
    log: () => {},
  };

  const skillContext = {
    log: context.apiContext.log,
    clock: createFakeClock({ startMs: 0 }),
    readInForce: () => context.inForce.read(),
    runInForceSeed: () => Promise.resolve(),
    refreshDefinitions: () => refreshDefinitions(parts, context.inForce),
  };

  const registry = buildToolRegistry(buildConversationSkillTools(skillContext, null));

  return { root, parts, registry, skillContext, definitionsRepo: buildStubDefinitionsRepo(root) };
}

test('it serves skill_vendor when the deployment exports to a definitions repo', async () => {
  const ctx = await setupTest();

  const tools = buildConversationSkillTools(ctx.skillContext, {
    readPage: () =>
      Promise.resolve({ kind: 'failed', reason: 'no fetch in this test', isGated: false }),
    repo: ctx.definitionsRepo,
    readReviewer: () => null,
  });

  expect(tools.map((tool) => tool.name)).toContain('skill_vendor');
});

test('it leaves skill_vendor out when the deployment exports nowhere', async () => {
  const ctx = await setupTest();

  const tools = buildConversationSkillTools(ctx.skillContext, null);

  expect(tools.map((tool) => tool.name)).not.toContain('skill_vendor');
});

test("it reads a skill on the conversation's list for the conversation", async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.root, 'skills', 'tide-tables'), { recursive: true });
  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'),
    '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n',
  );

  await runDefinitionsSeed(ctx.parts);

  const read = ctx.registry.findTool('skill_read');

  invariant(read);

  const outcome = await read.definition.run(
    { callID: 'call-1', tool: 'skill_read', input: { name: 'tide-tables' }, toolUseID: null },
    {
      callSequence: 1,
      run: {
        runID: 'run-1',
        thread: 'conversation',
        logThread: 'conversation',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  expect(outcome).toMatchObject({ status: 'ok', result: { text: '# Tides\n' } });
});

test('it refuses a skill to a run on another thread of the endpoint', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.root, 'skills', 'tide-tables'), { recursive: true });
  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'),
    '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n',
  );

  await runDefinitionsSeed(ctx.parts);

  const read = ctx.registry.findTool('skill_read');

  invariant(read);

  const outcome = await read.definition.run(
    { callID: 'call-1', tool: 'skill_read', input: { name: 'tide-tables' }, toolUseID: null },
    {
      callSequence: 1,
      run: {
        runID: 'run-2',
        thread: 'task-a',
        logThread: 'task-a',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'the skill tide-tables is not on your skill list',
  });
});

test('it reads the new text of a skill after a reload that seeds the changed file', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.root, 'skills', 'tide-tables'), { recursive: true });
  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'),
    '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n',
  );

  await runDefinitionsSeed(ctx.parts);

  const read = ctx.registry.findTool('skill_read');
  const reload = ctx.registry.findTool('skill_reload');

  invariant(read);
  invariant(reload);

  const run = {
    runID: 'run-1',
    thread: 'conversation',
    logThread: 'conversation',
    tools: [],
    model: { model: 'test-model', profile: 'standard' },
  };

  await read.definition.run(
    { callID: 'call-1', tool: 'skill_read', input: { name: 'tide-tables' }, toolUseID: null },
    { callSequence: 1, run },
  );

  await writeFile(
    join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'),
    '---\nname: tide-tables\ndescription: Reads a tide table by port.\n---\n# Tides by port\n',
  );

  await reload.definition.run(
    { callID: 'call-2', tool: 'skill_reload', input: { name: 'tide-tables' }, toolUseID: null },
    { callSequence: 1, run },
  );

  const outcome = await read.definition.run(
    { callID: 'call-3', tool: 'skill_read', input: { name: 'tide-tables' }, toolUseID: null },
    { callSequence: 1, run },
  );

  expect(outcome).toMatchObject({ status: 'ok', result: { text: '# Tides by port\n' } });
});
