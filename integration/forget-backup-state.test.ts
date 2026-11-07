import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { APIContext } from '@heynixie/api';
import { apiProjections, createAPIApp, defaultAPISettings, makeHostResponder } from '@heynixie/api';
import { buildTestClient, createDeviceSession } from '@heynixie/api/test-utils';
import type { BackupPass } from '@heynixie/backup';
import { getBackupStagingDir, startBackupSchedule } from '@heynixie/backup';
import { writeTestBackupReceipt } from '@heynixie/backup/test-utils';
import type { HostContractClient } from '@heynixie/contract';
import { localDataStorage, logProjections, startWriter } from '@heynixie/log';
import {
  defaultGateLimits,
  defaultOwnerPronouns,
  findNoAllowRule,
  memoryProjections,
  startMemoryStore,
} from '@heynixie/memory';
import { createMemoryItem } from '@heynixie/memory/test-utils';
import { runConversationReset } from '@heynixie/server';
import { tasksProjections } from '@heynixie/tasks';
import { buildTestClock, waitForCondition } from '@heynixie/testing';
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-forget-backup-'));

  stack.defer(() => rm(dataDir, { recursive: true, force: true }));

  const clock = buildTestClock(Date.parse('2026-11-02T09:00:00Z'));

  const writer = await startWriter({ dataDir, clock });

  stack.defer(() => writer.stop());

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  const context: APIContext = {
    log: {
      writer,
      deploymentKey,
      projections: [
        ...logProjections,
        ...tasksProjections,
        ...apiProjections,
        ...memoryProjections,
      ],
    },
    clock,
    definitions: () => ({ snapshotHash: 'sha256:test' }),
    settings: defaultAPISettings,
    readSessionCleanup: () => null,
  };

  const memory = await startMemoryStore({
    log: context.log,
    definitions: context.definitions,
    cleanupSessions: () => Promise.resolve(),
    gate: {
      check: () =>
        Promise.resolve({
          verdict: 'unsure',
          reason: 'no checker is wired',
          model: 'no-checker',
          failure: 'error',
        }),
      clock,
      defaultZone: 'UTC',
      findAllowRule: findNoAllowRule,
      limits: defaultGateLimits,
      ownerName: null,
      ownerPronouns: defaultOwnerPronouns,
      getPromptsInForce: () => ({ snapshotHash: 'sha256:test', prompts: {} }),
    },
  });

  stack.defer(() => memory.stop());

  const app = createAPIApp(context, () => memory).listen({ hostname: '127.0.0.1', port: 0 });

  stack.defer(async () => {
    await app.stop(true);
  });

  const laptop = await createDeviceSession(context, 'laptop');

  const respond = makeHostResponder({
    context,
    readMemory: () => memory,
    seedWrittenSkills: () => Promise.resolve(),
    readInForce: () => null,
    wakeExports: () => {},
    runReset: () => Promise.reject(new Error('no full reset runs in this suite')),
    runConversationReset: () =>
      runConversationReset({
        context,
        adapter: { id: 'stub', list: () => Promise.resolve([]) },
        stopWork: () => Promise.resolve(),
      }),
    gate: { runCall: (call) => call() },
  });

  const onPass = mock<(pass: BackupPass) => void>();
  const onError = mock<(error: unknown) => void>();

  return {
    dataDir,
    clock,
    memory,
    onPass,
    onError,
    client: buildTestClient(`http://127.0.0.1:${app.server?.port}`, laptop.token),
    host: createORPCClient<HostContractClient>(
      new RPCLink({ url: 'http://localhost/rpc', fetch: respond }),
    ),
    startSchedule: () => {
      const schedule = startBackupSchedule({
        context: { writer, storage: localDataStorage },
        intervalMs: 3_600_000,
        onAbandoned: () => {},
        onPass,
        onError,
      });

      stack.defer(() => schedule.stop());

      return schedule;
    },
  };
}

test('it keeps a forget pending while only a set staged before its delete has published', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory, { text: 'Keeps a spare key under the mat' });

  ctx.startSchedule();

  await waitForCondition(() => ctx.onPass.mock.calls.length === 1);

  await ctx.client.memory.forget({
    clientActionID: crypto.randomUUID(),
    itemID: item.itemID,
    version: 1,
  });

  await waitForCondition(() =>
    ctx.onPass.mock.calls.some((call) => call[0].staged?.kind === 'forget'),
  );

  await writeTestBackupReceipt(ctx.dataDir, { sequence: 1, status: 'published' });

  await waitForCondition(() => {
    ctx.clock.advance(60_000);

    return ctx.onPass.mock.calls.some((call) => call[0].received.length > 0);
  });

  const status = await ctx.client.memory.readForgetStatus({ itemIDs: [item.itemID] });

  expect(status).toStrictEqual({
    deleted: [item.itemID],
    pending: [],
    backup: { state: 'pending' },
  });
});

test('it completes a forget once the receipt of the set staged after its delete arrives', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory, { text: 'Keeps a spare key under the mat' });

  ctx.startSchedule();

  await waitForCondition(() => ctx.onPass.mock.calls.length === 1);

  await ctx.client.memory.forget({
    clientActionID: crypto.randomUUID(),
    itemID: item.itemID,
    version: 1,
  });

  await waitForCondition(() =>
    ctx.onPass.mock.calls.some((call) => call[0].staged?.kind === 'forget'),
  );

  await writeTestBackupReceipt(ctx.dataDir, { sequence: 2, status: 'published' });

  await waitForCondition(() => {
    ctx.clock.advance(60_000);

    return ctx.onPass.mock.calls.some((call) => call[0].received.length > 0);
  });

  const status = await ctx.client.memory.readForgetStatus({ itemIDs: [item.itemID] });

  expect(status.backup).toStrictEqual({ state: 'complete' });
});

test('it reports a failed prune with its reason, and keeps the forget open', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory, { text: 'Keeps a spare key under the mat' });

  ctx.startSchedule();

  await waitForCondition(() => ctx.onPass.mock.calls.length === 1);

  await ctx.client.memory.forget({
    clientActionID: crypto.randomUUID(),
    itemID: item.itemID,
    version: 1,
  });

  await waitForCondition(() =>
    ctx.onPass.mock.calls.some((call) => call[0].staged?.kind === 'forget'),
  );

  await writeTestBackupReceipt(ctx.dataDir, {
    sequence: 2,
    status: 'failed',
    failure: 'keys: prune exited 1',
  });

  await waitForCondition(() => {
    ctx.clock.advance(60_000);

    return ctx.onPass.mock.calls.some((call) => call[0].received.length > 0);
  });

  const status = await ctx.client.memory.readForgetStatus({ itemIDs: [item.itemID] });

  expect(status.backup).toStrictEqual({ state: 'failed', failure: 'keys: prune exited 1' });
});

test('it completes a forget after a failed prune once the next scheduled set publishes', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory, { text: 'Keeps a spare key under the mat' });

  ctx.startSchedule();

  await waitForCondition(() => ctx.onPass.mock.calls.length === 1);

  await ctx.client.memory.forget({
    clientActionID: crypto.randomUUID(),
    itemID: item.itemID,
    version: 1,
  });

  await waitForCondition(() =>
    ctx.onPass.mock.calls.some((call) => call[0].staged?.kind === 'forget'),
  );

  await writeTestBackupReceipt(ctx.dataDir, { sequence: 1, status: 'published' });

  await writeTestBackupReceipt(ctx.dataDir, {
    sequence: 2,
    status: 'failed',
    failure: 'keys: prune exited 1',
  });

  await waitForCondition(() => {
    ctx.clock.advance(60_000);

    return ctx.onPass.mock.calls.some((call) => call[0].staged?.sequence === 3);
  });

  await writeTestBackupReceipt(ctx.dataDir, { sequence: 3, status: 'published' });

  await waitForCondition(() => {
    ctx.clock.advance(60_000);

    return ctx.onPass.mock.calls.some((call) =>
      call[0].received.some((receipt) => receipt.sequence === 3),
    );
  });

  const status = await ctx.client.memory.readForgetStatus({ itemIDs: [item.itemID] });

  expect(status.backup).toStrictEqual({ state: 'complete' });
});

test('it completes a forget whose set a staging error held back, once a later pass stages it', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory, { text: 'Keeps a spare key under the mat' });

  await writeFile(getBackupStagingDir(ctx.dataDir), 'a file where staging belongs');

  ctx.startSchedule();

  await ctx.client.memory.forget({
    clientActionID: crypto.randomUUID(),
    itemID: item.itemID,
    version: 1,
  });

  await waitForCondition(() => ctx.onError.mock.calls.length > 0);
  await rm(getBackupStagingDir(ctx.dataDir));

  await waitForCondition(() => {
    ctx.clock.advance(60_000);

    return ctx.onPass.mock.calls.some((call) => call[0].staged?.kind === 'forget');
  });

  await writeTestBackupReceipt(ctx.dataDir, { sequence: 1, status: 'published' });

  await waitForCondition(() => {
    ctx.clock.advance(60_000);

    return ctx.onPass.mock.calls.some((call) => call[0].received.length > 0);
  });

  const status = await ctx.client.memory.readForgetStatus({ itemIDs: [item.itemID] });

  expect(status.backup).toStrictEqual({ state: 'complete' });
});

test('it keeps a forget pending past the backup interval while its set has no receipt', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory, { text: 'Keeps a spare key under the mat' });

  ctx.startSchedule();

  await waitForCondition(() => ctx.onPass.mock.calls.length === 1);

  await ctx.client.memory.forget({
    clientActionID: crypto.randomUUID(),
    itemID: item.itemID,
    version: 1,
  });

  await waitForCondition(() =>
    ctx.onPass.mock.calls.some((call) => call[0].staged?.kind === 'forget'),
  );

  ctx.clock.advance(3_600_000);

  const passes = ctx.onPass.mock.calls.length;

  await waitForCondition(() => {
    ctx.clock.advance(60_000);

    return ctx.onPass.mock.calls.length > passes;
  });

  const status = await ctx.client.memory.readForgetStatus({ itemIDs: [item.itemID] });

  expect(status.backup).toStrictEqual({ state: 'pending' });
});

test('it completes a forget after a restart from the receipt the job wrote while nixie was down', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory, { text: 'Keeps a spare key under the mat' });

  const first = ctx.startSchedule();

  await waitForCondition(() => ctx.onPass.mock.calls.length === 1);

  await ctx.client.memory.forget({
    clientActionID: crypto.randomUUID(),
    itemID: item.itemID,
    version: 1,
  });

  await waitForCondition(() =>
    ctx.onPass.mock.calls.some((call) => call[0].staged?.kind === 'forget'),
  );

  await first.stop();

  await writeTestBackupReceipt(ctx.dataDir, { sequence: 2, status: 'published' });

  ctx.startSchedule();

  await waitForCondition(() => ctx.onPass.mock.calls.some((call) => call[0].received.length > 0));

  const status = await ctx.client.memory.readForgetStatus({ itemIDs: [item.itemID] });

  expect(status.backup).toStrictEqual({ state: 'complete' });
});

test('it reports a client forget as pending on its key backups', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory, { text: 'Keeps a spare key under the mat' });

  const forgotten = await ctx.client.memory.forget({
    clientActionID: crypto.randomUUID(),
    itemID: item.itemID,
    version: 1,
  });

  expect(forgotten).toStrictEqual({ itemID: item.itemID, backup: { state: 'pending' } });
});

test('it reports a host forget as pending on its key backups, as a client forget', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory, { text: 'Keeps a spare key under the mat' });
  const forgotten = await ctx.host.memory.items.forget({ itemID: item.itemID, version: 1 });

  expect(forgotten).toStrictEqual({ itemID: item.itemID, backup: { state: 'pending' } });
});

test('it reports a reset of the memories as pending on its key backups, as a forget', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory, { text: 'Keeps a spare key under the mat' });
  const reset = await ctx.host.memory.items.forgetAll();

  expect(reset).toStrictEqual({ itemIDs: [item.itemID], backup: { state: 'pending' } });
});

test('it reports a reset of the conversations as pending on its key backups, as a forget', async () => {
  const ctx = await setupTest();
  const reset = await ctx.host.resetConversations();

  expect(reset).toStrictEqual({
    resetAt: expect.toBeValidDate(),
    lastSequence: expect.any(Number),
    shreddedRecords: 0,
    backup: { state: 'pending' },
  });
});

test('it completes a reset of the memories with the receipt of the set staged after it, as a forget', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory, { text: 'Keeps a spare key under the mat' });

  ctx.startSchedule();

  await waitForCondition(() => ctx.onPass.mock.calls.length === 1);

  await ctx.host.memory.items.forgetAll();

  await waitForCondition(() =>
    ctx.onPass.mock.calls.some((call) => call[0].staged?.kind === 'forget'),
  );

  await writeTestBackupReceipt(ctx.dataDir, { sequence: 2, status: 'published' });

  await waitForCondition(() => {
    ctx.clock.advance(60_000);

    return ctx.onPass.mock.calls.some((call) => call[0].received.length > 0);
  });

  const status = await ctx.client.memory.readForgetStatus({ itemIDs: [item.itemID] });

  expect(status.backup).toStrictEqual({ state: 'complete' });
});

test('it stages a forget set for a reset of the conversations', async () => {
  const ctx = await setupTest();

  ctx.startSchedule();

  await waitForCondition(() => ctx.onPass.mock.calls.length === 1);

  await ctx.host.resetConversations();

  await waitForCondition(() =>
    ctx.onPass.mock.calls.some((call) => call[0].staged?.kind === 'forget'),
  );

  expect(ctx.onPass.mock.calls.flatMap((call) => call[0].staged?.kind ?? [])).toStrictEqual([
    'scheduled',
    'forget',
  ]);
});
