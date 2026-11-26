import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPathSource } from '@heynixie/definitions';
import { buildTestTaskSeed } from '@heynixie/definitions/test-utils';
import { buildTestRunSettings, buildTestTaskRunners } from '@heynixie/tasks/test-utils';
import type { SeedParts } from '../seed/run-queued-seed';
import { createServerContext } from '../server/create-server-context';
import { startTestLog } from '../test-utils/start-test-log';
import { buildStartState } from '../utils/build-start-state';
import { runDefinitionsSeed } from './run-definitions-seed';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-definitions-seed-'));

  stack.defer(() => rm(dataDir, { recursive: true, force: true }));

  const log = await startTestLog(dataDir);

  stack.defer(() => log.writer.stop());

  const root = join(dataDir, 'definitions');

  await mkdir(root);

  const context = await createServerContext(log.writer, log.deploymentKey, () => null, {
    runSettings: buildTestRunSettings(),
    taskRunLimits: { turns: 25, dollars: 2 },
    defaultZone: 'Europe/Lisbon',
    features: [],
    runners: buildTestTaskRunners(),
  });

  return { root, context };
}

test('it turns the definitions part unready while a refused snapshot is pending, and keeps the last good seed in force', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const parts: SeedParts = {
    context: ctx.context.apiContext,
    source: createPathSource({ directory: ctx.root }),
    tasks: buildTestTaskSeed(),
    buildPolicy: () => ({ rules: [], tools: [] }),
    inForce: ctx.context.inForce,
    state: buildStartState({ isReady: true, reason: null }),
    log: () => {},
  };

  const first = await runDefinitionsSeed(parts);

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: [1\n');

  const refused = await runDefinitionsSeed(parts);

  expect(refused.status).toBe('refused');

  expect(parts.state.read().definitions).toStrictEqual({
    isReady: false,
    reason: 'the last snapshot was refused: DefinitionsParseError',
  });

  expect(ctx.context.inForce.read()).toStrictEqual(first.inForce);
});

test('it turns the definitions part ready once a seed succeeds', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const parts: SeedParts = {
    context: ctx.context.apiContext,
    source: createPathSource({ directory: ctx.root }),
    tasks: buildTestTaskSeed(),
    buildPolicy: () => ({ rules: [], tools: [] }),
    inForce: ctx.context.inForce,
    state: buildStartState({ isReady: true, reason: null }),
    log: () => {},
  };

  await runDefinitionsSeed(parts);

  expect(parts.state.read().definitions).toStrictEqual({ isReady: true, reason: null });
});

test('it logs a warning for each skipped definition and each dropped tool', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 4\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'tasks', 'rain-gauge'), { recursive: true });
  await mkdir(join(ctx.root, 'tasks', 'dish-rota'), { recursive: true });

  await writeFile(
    join(ctx.root, 'tasks', 'rain-gauge', 'task.yaml'),
    'name: Check\nbrief: Read it.\nrole: helper\n',
  );

  await writeFile(
    join(ctx.root, 'tasks', 'dish-rota', 'task.yaml'),
    'name: Rota\nbrief: Say whose turn it is.\ntools:\n  - time.now\n  - telepathy.send\n',
  );

  const logged: [string, unknown, string | undefined][] = [];

  const parts: SeedParts = {
    context: ctx.context.apiContext,
    source: createPathSource({ directory: ctx.root }),
    tasks: buildTestTaskSeed(),
    buildPolicy: () => ({ rules: [], tools: [] }),
    inForce: ctx.context.inForce,
    state: buildStartState({ isReady: true, reason: null }),
    log: (event, fields, level) => {
      logged.push([event, fields, level]);
    },
  };

  await runDefinitionsSeed(parts);

  expect(logged.filter((entry) => entry[2] === 'warn')).toStrictEqual([
    [
      'definitions.task_tool_dropped',
      { kind: 'tool_dropped', definition: 'dish-rota', tool: 'telepathy.send' },
      'warn',
    ],
    [
      'definitions.task_skipped',
      { kind: 'field_unknown', definition: 'rain-gauge', field: 'role' },
      'warn',
    ],
  ]);
});

test('it turns the definitions part unready when a task definition has a fault', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 4\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'tasks', 'Bad_Id'), { recursive: true });
  await writeFile(join(ctx.root, 'tasks', 'Bad_Id', 'task.yaml'), 'name: Bad\nbrief: Bad.\n');

  const parts: SeedParts = {
    context: ctx.context.apiContext,
    source: createPathSource({ directory: ctx.root }),
    tasks: buildTestTaskSeed(),
    buildPolicy: () => ({ rules: [], tools: [] }),
    inForce: ctx.context.inForce,
    state: buildStartState({ isReady: true, reason: null }),
    log: () => {},
  };

  await runDefinitionsSeed(parts);

  expect(parts.state.read().definitions).toStrictEqual({
    isReady: false,
    reason: 'the last snapshot was refused: TaskSeedRefusedError',
  });
});
