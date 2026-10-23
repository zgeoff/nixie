import { expect, onTestFinished, test } from 'bun:test';
import {
  defaultGateLimits,
  defaultOwnerPronouns,
  findNoAllowRule,
  startMemoryStore,
} from '@heynixie/memory';
import { createDeviceSession } from './test-utils/create-device-session';
import { startTestAPI } from './test-utils/start-test-api';
import type { APITables } from './types';
import type { MemoryChangeAction } from './write-memory-change';
import { writeMemoryChange } from './write-memory-change';
import { writeSessionRevocation } from './write-session-revocation';

async function setupTest() {
  const api = await startTestAPI();

  const memory = await startMemoryStore({
    log: api.context.log,
    definitions: () => ({ snapshotHash: 'sha256:test' }),
    cleanupSessions: () => Promise.resolve(),
    gate: {
      check: () =>
        Promise.resolve({
          verdict: 'unsure',
          reason: 'no checker is wired',
          model: 'no-checker',
          failure: 'error',
        }),
      clock: api.clock,
      defaultZone: 'UTC',
      findAllowRule: findNoAllowRule,
      limits: defaultGateLimits,
      ownerName: null,
      ownerPronouns: defaultOwnerPronouns,
    },
  });

  onTestFinished(() => memory.stop());

  return { ...api, memory };
}

test('it makes the change and keeps its result with it', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const item = await ctx.memory.remember({
    text: 'Keeps a spare key with the neighbour',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const outcome = await writeMemoryChange(ctx.context, laptop.caller, {
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    procedure: 'memory.retire',
    input: { itemID: item.itemID, version: 1 },
    result: { itemID: item.itemID, version: 2 },
    apply: (writeInTransaction) =>
      ctx.memory.retire({
        target: item,
        provenance: {
          origin: 'owner',
          source: 'owner',
          taskID: null,
          proposalID: null,
          checks: null,
        },
        writeInTransaction,
      }),
  });

  const actions = await ctx.writer.db
    .$extendTables<APITables>()
    .selectFrom('client_actions')
    .select(['client_action_id', 'procedure', 'result'])
    .where('procedure', 'like', 'memory.%')
    .execute();

  expect(outcome).toBe('applied');

  expect(actions).toStrictEqual([
    {
      client_action_id: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
      procedure: 'memory.retire',
      result: JSON.stringify({ itemID: item.itemID, version: 2 }),
    },
  ]);
});

test('it answers a retry as applied without running the change again', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const item = await ctx.memory.remember({
    text: 'Keeps a spare key with the neighbour',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const action: MemoryChangeAction = {
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    procedure: 'memory.retire',
    input: { itemID: item.itemID, version: 1 },
    result: { itemID: item.itemID, version: 2 },
    apply: (writeInTransaction) =>
      ctx.memory.retire({
        target: item,
        provenance: {
          origin: 'owner',
          source: 'owner',
          taskID: null,
          proposalID: null,
          checks: null,
        },
        writeInTransaction,
      }),
  };

  await writeMemoryChange(ctx.context, laptop.caller, action);

  const retried = await writeMemoryChange(ctx.context, laptop.caller, action);
  const history = await ctx.memory.readHistory(item.itemID);

  expect(retried).toBe('applied');
  expect(history?.versions).toHaveLength(2);
});

test('it answers an ID that another action used as reused, and changes nothing', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const first = await ctx.memory.remember({
    text: 'Keeps a spare key with the neighbour',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const second = await ctx.memory.remember({
    text: 'Waters the ferns on Sundays',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await writeMemoryChange(ctx.context, laptop.caller, {
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    procedure: 'memory.retire',
    input: { itemID: first.itemID, version: 1 },
    result: { itemID: first.itemID, version: 2 },
    apply: (writeInTransaction) =>
      ctx.memory.retire({
        target: first,
        provenance: {
          origin: 'owner',
          source: 'owner',
          taskID: null,
          proposalID: null,
          checks: null,
        },
        writeInTransaction,
      }),
  });

  const outcome = await writeMemoryChange(ctx.context, laptop.caller, {
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    procedure: 'memory.retire',
    input: { itemID: second.itemID, version: 1 },
    result: { itemID: second.itemID, version: 2 },
    apply: (writeInTransaction) =>
      ctx.memory.retire({
        target: second,
        provenance: {
          origin: 'owner',
          source: 'owner',
          taskID: null,
          proposalID: null,
          checks: null,
        },
        writeInTransaction,
      }),
  });

  const history = await ctx.memory.readHistory(second.itemID);

  expect(outcome).toBe('reused');
  expect(history?.state).toBe('active');
});

test('it refuses a change from a session revoked after the call resolved it', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const item = await ctx.memory.remember({
    text: 'Keeps a spare key with the neighbour',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await writeSessionRevocation(ctx.context, laptop.caller, {
    clientActionID: '9a3e6c21-4b7d-4f8a-b2c5-1d0e7f9a6b34',
    sessionID: laptop.sessionID,
  });

  const outcome = await writeMemoryChange(ctx.context, laptop.caller, {
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    procedure: 'memory.retire',
    input: { itemID: item.itemID, version: 1 },
    result: { itemID: item.itemID, version: 2 },
    apply: (writeInTransaction) =>
      ctx.memory.retire({
        target: item,
        provenance: {
          origin: 'owner',
          source: 'owner',
          taskID: null,
          proposalID: null,
          checks: null,
        },
        writeInTransaction,
      }),
  });

  const history = await ctx.memory.readHistory(item.itemID);

  expect(outcome).toBe('unauthorized');
  expect(history?.state).toBe('active');
});

test('it keeps no result when the change fails', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const item = await ctx.memory.remember({
    text: 'Keeps a spare key with the neighbour',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const change = writeMemoryChange(ctx.context, laptop.caller, {
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    procedure: 'memory.restore',
    input: { itemID: item.itemID, version: 1 },
    result: { itemID: item.itemID, version: 2 },
    apply: (writeInTransaction) =>
      ctx.memory.restore({
        target: item,
        provenance: {
          origin: 'owner',
          source: 'owner',
          taskID: null,
          proposalID: null,
          checks: null,
        },
        writeInTransaction,
      }),
  });

  await change.catch(() => {});

  const actions = await ctx.writer.db
    .$extendTables<APITables>()
    .selectFrom('client_actions')
    .select('client_action_id')
    .where('procedure', 'like', 'memory.%')
    .execute();

  expect(change).rejects.toMatchObject({ code: 'WRONG_STATE' });
  expect(actions).toStrictEqual([]);
});
