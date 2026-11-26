import { expect, mock, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  createClientRegistry,
  createPasskeyState,
  defaultAPISettings,
  readAllPasskeys,
} from '@heynixie/api';
import { createDeviceSession, seedPasskey, seedRevokedPasskey } from '@heynixie/api/test-utils';
import {
  createPathSource,
  readRuleProposals,
  readRulesInForce,
  runSeed,
} from '@heynixie/definitions';
import { buildTestTaskSeed } from '@heynixie/definitions/test-utils';
import { readDeviceByIdentity } from '@heynixie/devices';
import { makeDeviceToolCaller, seedScreenOnDevice } from '@heynixie/devices/test-utils';
import { readRecords, writeRecords } from '@heynixie/log';
import { buildMockSandboxSpec } from '@heynixie/sandbox/test-utils';
import { createConversationTask, startTaskClaimPools } from '@heynixie/tasks';
import { readTestTasks } from '@heynixie/tasks/test-utils';
import { makeGatedCall } from '@heynixie/testing';
import { runTestSeed } from '../test-utils/run-test-seed';
import { startTestServer } from '../test-utils/start-test-server';
import { runServerReset } from './run-server-reset';

async function setupTest() {
  const server = await startTestServer();

  const context = {
    ...server.context,
    settings: defaultAPISettings,
    readSessionCleanup: () => null,
    readZone: () => Promise.resolve('UTC'),
    passkeys: createPasskeyState(),
    clients: createClientRegistry({ clock: server.context.clock }),
  };

  return { ...server, context };
}

test('it starts the new log with the definitions in force, then the reset on the conversation thread', async () => {
  const ctx = await setupTest();
  const seeded = await runTestSeed(ctx.context.log, ctx.dataDir);

  await createConversationTask(ctx.context);

  await writeRecords(ctx.context.log, [
    { kind: 'owner_message', definitions: { snapshotHash: 'sha256:test' }, thread: 'conversation' },
  ]);

  const reset = await runServerReset({
    context: ctx.context,
    adapter: ctx.sandboxes,
    stopWork: () => Promise.resolve(),
    log: () => {},
  });

  const read = await readRecords(ctx.context.log, { afterSequence: 0 });

  expect(read.map((entry) => entry.record)).toMatchObject([
    {
      sequence: 4,
      kind: 'definitions_seeded',
      thread: null,
      definitions: { snapshotHash: seeded.inForce?.snapshotHash },
    },
    {
      sequence: 5,
      kind: 'log_reset',
      thread: 'conversation',
      definitions: { snapshotHash: seeded.inForce?.snapshotHash },
      payload: {
        resetAt: reset.resetAt.getTime(),
        lastSequence: 3,
        mode: 'full',
        keptSessions: 0,
      },
      erasable: { status: 'none' },
    },
  ]);
});

test('it keeps the rules in force and their revisions through a reset', async () => {
  const ctx = await setupTest();

  const root = join(ctx.dataDir, 'rule-definitions');

  await mkdir(join(root, 'rules'), { recursive: true });
  await writeFile(join(root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(root, 'persona.md'), '# Persona\n');
  await writeFile(join(root, 'rules', 'shell.yaml'), 'deny-shell:\n  outcome: deny\n');

  await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.context.log,
    source: createPathSource({ directory: root }),
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  await runServerReset({
    context: ctx.context,
    adapter: ctx.sandboxes,
    stopWork: () => Promise.resolve(),
    log: () => {},
  });

  const rules = await readRulesInForce(ctx.context.log.writer.db);

  expect(rules.map((rule) => [rule.ruleID, rule.revision])).toStrictEqual([['deny-shell', 1]]);
});

test('it keeps an allow that a first seed put in force through a reset, and the next seed proposes nothing', async () => {
  const ctx = await setupTest();

  const root = join(ctx.dataDir, 'rule-definitions');
  const source = createPathSource({ directory: root });

  await mkdir(join(root, 'rules'), { recursive: true });
  await writeFile(join(root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(root, 'rules', 'web.yaml'),
    'allow-web:\n  outcome: allow\n  tools: [web.fetch]\n',
  );

  await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.context.log,
    source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  await runServerReset({
    context: ctx.context,
    adapter: ctx.sandboxes,
    stopWork: () => Promise.resolve(),
    log: () => {},
  });

  await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.context.log,
    source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  const rules = await readRulesInForce(ctx.context.log.writer.db);
  const proposals = await readRuleProposals(ctx.context.log.writer.db);

  expect({
    rules: rules.map((rule) => [rule.ruleID, rule.revision]),
    proposals,
  }).toStrictEqual({ rules: [['allow-web', 1]], proposals: [] });
});

test('it destroys every sandbox before it resets', async () => {
  const ctx = await setupTest();

  await runTestSeed(ctx.context.log, ctx.dataDir);

  const sandbox = await ctx.sandboxes.create(
    buildMockSandboxSpec({ kind: 'conversation', image: 'conversation', owner: 'conversation' }),
  );

  const before = await ctx.readSandboxIDs();

  await runServerReset({
    context: ctx.context,
    adapter: ctx.sandboxes,
    stopWork: () => Promise.resolve(),
    log: () => {},
  });

  const after = await ctx.readSandboxIDs();

  expect(before).toStrictEqual([sandbox.id]);
  expect(after).toStrictEqual([]);
});

test('it removes nothing from the database or the key store when a sandbox destroy fails', async () => {
  const ctx = await setupTest();

  await runTestSeed(ctx.context.log, ctx.dataDir);
  await createConversationTask(ctx.context);

  await ctx.sandboxes.create(
    buildMockSandboxSpec({ kind: 'conversation', image: 'conversation', owner: 'conversation' }),
  );

  await writeRecords(ctx.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'book the dentist' },
    },
  ]);

  const reset = runServerReset({
    context: ctx.context,
    adapter: {
      id: 'process',
      list: () =>
        Promise.resolve([
          {
            id: 'nixie-stuck',
            spec: buildMockSandboxSpec({ owner: 'conversation' }),
            destroy: () => Promise.reject(new Error('the runtime refused the destroy')),
          },
        ]),
    },
    stopWork: () => Promise.resolve(),
    log: () => {},
  });

  await Promise.allSettled([reset]);

  const read = await readRecords(ctx.context.log, { afterSequence: 0 });

  expect(reset).rejects.toThrowWithMessage(Error, /nixie-stuck/u);

  expect(read.map((entry) => [entry.record.sequence, entry.record.kind])).toStrictEqual([
    [1, 'definitions_seeded'],
    [2, 'task.created'],
    [3, 'sandbox.created'],
    [4, 'owner_message'],
  ]);

  expect(read.at(-1)?.record.erasable).toStrictEqual({
    status: 'readable',
    fields: { text: 'book the dentist' },
  });
});

test('it refuses a reset before any definitions are in force, and stops no work', async () => {
  const server = await startTestServer();

  const stopWork = mock(() => Promise.resolve());

  const reset = runServerReset({
    context: {
      ...server.context,
      settings: defaultAPISettings,
      readSessionCleanup: () => null,
      readZone: () => Promise.resolve('UTC'),
      passkeys: createPasskeyState(),
      clients: createClientRegistry({ clock: server.context.clock }),
    },
    adapter: server.sandboxes,
    stopWork,
    log: () => {},
  });

  await Promise.allSettled([reset]);

  expect(reset).rejects.toThrowWithMessage(
    Error,
    'no definitions are in force yet, so the reset has nothing to start from',
  );

  expect(stopWork).not.toHaveBeenCalled();
});

test('it commits nothing of a turn still running at the end of the stop grace', async () => {
  const ctx = await setupTest();

  await runTestSeed(ctx.context.log, ctx.dataDir);
  await createConversationTask(ctx.context);

  await writeRecords(ctx.context.log, [
    { kind: 'owner_message', definitions: { snapshotHash: 'sha256:test' }, thread: 'conversation' },
  ]);

  const turn = makeGatedCall(() =>
    Promise.resolve({
      next: 'wait' as const,
      records: [
        {
          kind: 'model.reply' as const,
          definitions: { snapshotHash: 'sha256:test' },
          thread: 'conversation',
          erasable: { text: 'Your dentist is booked.' },
        },
      ],
      acknowledged: [],
    }),
  );

  const runners = startTaskClaimPools(ctx.context, {
    runStep: turn.call,
    onStepErrored: mock<Parameters<typeof startTaskClaimPools>[1]['onStepErrored']>(),
    onError: mock<Parameters<typeof startTaskClaimPools>[1]['onError']>(),
    logger: () => {},
    size: 1,
  });

  ctx.defer(() => runners.stop());

  await turn.started;

  const reset = await runServerReset({
    context: ctx.context,
    adapter: ctx.sandboxes,
    stopWork: () => runners.stop(50),
    log: () => {},
  });

  turn.release();

  const read = await runners
    .stop()
    .then(() => readRecords(ctx.context.log, { afterSequence: reset.lastSequence }));

  expect(read.map((entry) => entry.record.kind)).toStrictEqual(['definitions_seeded', 'log_reset']);
});

test('it folds the reset on the conversation thread, which the conversation task the start creates again takes up', async () => {
  const ctx = await setupTest();

  await runTestSeed(ctx.context.log, ctx.dataDir);

  const reset = await runServerReset({
    context: ctx.context,
    adapter: ctx.sandboxes,
    stopWork: () => Promise.resolve(),
    log: () => {},
  });

  await createConversationTask(ctx.context);

  const thread = await readRecords(ctx.context.log, { afterSequence: 0, thread: 'conversation' });
  const tasks = await readTestTasks(ctx.context.log.writer);

  expect(thread.map((entry) => [entry.record.sequence, entry.record.kind])).toStrictEqual([
    [reset.lastSequence + 2, 'log_reset'],
    [reset.lastSequence + 3, 'task.created'],
  ]);

  expect(tasks.map((task) => [task.id, task.createdSequence])).toStrictEqual([
    ['conversation', reset.lastSequence + 3],
  ]);
});

test('it keeps each live passkey and deletes each revoked one through a reset', async () => {
  const ctx = await setupTest();

  await runTestSeed(ctx.context.log, ctx.dataDir);

  const session = await createDeviceSession(ctx.context, 'laptop');
  const live = await seedPasskey(ctx.context, { caller: session.caller });

  await seedRevokedPasskey(ctx.context, { caller: session.caller });

  await runServerReset({
    context: ctx.context,
    adapter: ctx.sandboxes,
    stopWork: () => Promise.resolve(),
    log: () => {},
  });

  const kept = await readAllPasskeys(ctx.context.log.writer.db);

  expect(kept.map((row) => row.passkey_id)).toStrictEqual([live.passkeyID]);
});

test('it keeps an enrolled device through a reset and clears what it showed', async () => {
  const ctx = await setupTest();

  await runTestSeed(ctx.context.log, ctx.dataDir);
  await createConversationTask(ctx.context);

  const device = await seedScreenOnDevice({ log: ctx.context.log, clock: ctx.context.clock });

  ctx.context.clients.devices.open(device.deviceID, { width: 1920, height: 480, pixelRatio: 1 });

  const call = makeDeviceToolCaller({
    log: ctx.context.log,
    definitions: ctx.context.definitions,
    clock: ctx.context.clock,
    streams: ctx.context.clients.devices,
    readCallSession: () => Promise.resolve(null),
  });

  await call('device.setIdle', {
    device: device.deviceID,
    scene: [{ kind: 'markdown', text: '# Saturday' }],
  });

  await call('device.show', {
    device: device.deviceID,
    content: { kind: 'markdown', text: '# Saturday' },
  });

  await runServerReset({
    context: ctx.context,
    adapter: ctx.sandboxes,
    stopWork: () => Promise.resolve(),
    log: () => {},
  });

  const kept = await readDeviceByIdentity(ctx.context.log.writer.db, device.identityID);

  expect(kept).toMatchObject({
    deviceID: device.deviceID,
    name: 'desk panel',
    shownSequence: null,
    idleSequence: null,
  });
});
