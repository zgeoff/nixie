import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPathSource, loadSnapshotSkills } from '@heynixie/definitions';
import { buildTestTaskSeed } from '@heynixie/definitions/test-utils';
import { buildTestRunSettings, buildTestTaskRunners } from '@heynixie/tasks/test-utils';
import invariant from 'tiny-invariant';
import type { SeedParts } from '../seed/run-queued-seed';
import { createServerContext } from '../server/create-server-context';
import { startTestLog } from '../test-utils/start-test-log';
import { buildStartState } from '../utils/build-start-state';
import { refreshDefinitions } from './refresh-definitions';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-refresh-definitions-'));

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

  return { root, context, writer: log.writer };
}

test('it seeds a new revision and returns the definitions it put in force', async () => {
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

  const inForce = await refreshDefinitions(parts, ctx.context.inForce);

  expect(inForce?.persona).toBe('# Persona\n');
});

test('it keeps the last good definitions in force when the source refuses a snapshot', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await mkdir(join(ctx.root, 'skills', 'tide-tables'), { recursive: true });

  await writeFile(
    join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'),
    '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n',
  );

  const parts: SeedParts = {
    context: ctx.context.apiContext,
    source: createPathSource({ directory: ctx.root }),
    tasks: buildTestTaskSeed(),
    buildPolicy: () => ({ rules: [], tools: [] }),
    inForce: ctx.context.inForce,
    state: buildStartState({ isReady: true, reason: null }),
    log: () => {},
  };

  const good = await refreshDefinitions(parts, ctx.context.inForce);

  await writeFile(join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'), '# Tides, by port\n');

  const inForce = await refreshDefinitions(parts, ctx.context.inForce);

  invariant(good !== null && inForce !== null);

  const skills = await loadSnapshotSkills(ctx.writer.db, inForce.snapshotHash);

  expect(inForce.snapshotHash).toBe(good.snapshotHash);

  expect(skills.map((skill) => skill.files.get('SKILL.md'))).toStrictEqual([
    '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n',
  ]);
});

test('it returns the definitions in force, and seeds nothing, before the server parts start', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const inForce = await refreshDefinitions(null, ctx.context.inForce);

  expect(inForce).toBeNull();
});
