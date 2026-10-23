import { expect, onTestFinished, test } from 'bun:test';
import {
  defaultGateLimits,
  defaultOwnerPronouns,
  findNoAllowRule,
  startMemoryStore,
} from '@heynixie/memory';
import {
  buildMockCheckerAnswer,
  buildMockWriteCaller,
  writeOwnerMessages,
} from '@heynixie/memory/test-utils';
import invariant from 'tiny-invariant';
import { buildTestClient } from './test-utils/build-test-client';
import { createDeviceSession } from './test-utils/create-device-session';
import { startTestAPI } from './test-utils/start-test-api';
import type { APITables } from './types';

async function setupTest() {
  const api = await startTestAPI();

  const memory = await startMemoryStore({
    log: api.context.log,
    definitions: () => ({ snapshotHash: 'sha256:test' }),
    cleanupSessions: () => Promise.resolve(),
    gate: {
      check: () => Promise.resolve(buildMockCheckerAnswer()),
      clock: api.clock,
      defaultZone: 'UTC',
      findAllowRule: findNoAllowRule,
      limits: defaultGateLimits,
      ownerName: null,
      ownerPronouns: defaultOwnerPronouns,
      getPromptsInForce: () => ({ snapshotHash: 'sha256:test', prompts: {} }),
    },
  });

  onTestFinished(() => memory.stop());

  api.setMemory(memory);

  return { ...api, memory, db: api.context.log.writer.db.$extendTables<APITables>() };
}

test("#memory.listNotices lists a turn's notice with each item as it now stands", async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');
  const [sequence] = await writeOwnerMessages(ctx.context.log, ['I cycle to work every day']);

  const written = await ctx.memory.writes.remember({
    text: 'Cycles to work',
    quote: 'I cycle to work',
    caller: buildMockWriteCaller(),
  });

  invariant(written.status === 'applied' && sequence !== undefined);

  const listed = await buildTestClient(ctx.url, laptop.token).memory.listNotices({
    thread: 'conversation',
  });

  expect(listed.notices).toMatchObject([
    {
      noticeKey: `turn/conversation/${String(sequence)}`,
      kind: 'turn',
      messageSequence: sequence,
      remembered: 1,
      retired: 0,
      proposed: 0,
      entries: [
        {
          itemID: written.itemID,
          change: 'created',
          version: 1,
          isKept: false,
          item: { state: 'active', version: 1, change: 'created', text: 'Cycles to work' },
        },
      ],
    },
  ]);
});

test('#memory.listNotices refuses a caller with no session', async () => {
  const ctx = await setupTest();

  const listed = buildTestClient(ctx.url).memory.listNotices({
    thread: 'conversation',
  });

  await listed.catch(() => {});

  expect(listed).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('#memory.undo undoes the version the notice showed, as your own change', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  await writeOwnerMessages(ctx.context.log, ['I cycle to work every day']);

  const written = await ctx.memory.writes.remember({
    text: 'Cycles to work',
    quote: 'I cycle to work',
    caller: buildMockWriteCaller(),
  });

  invariant(written.status === 'applied');

  const undone = await buildTestClient(ctx.url, laptop.token).memory.undo({
    clientActionID: '0b6f3e2a-71c4-4d8e-9a5b-2f1c8e7d6a43',
    itemID: written.itemID,
    version: 1,
  });

  const history = await ctx.memory.readHistory(written.itemID);

  expect(undone).toStrictEqual({ itemID: written.itemID, version: 2 });

  expect(history).toMatchObject({
    state: 'retired',
    versions: [{ change: 'created' }, { change: 'undone', origin: 'owner', state: 'retired' }],
  });
});

test('#memory.undo refuses an item that changed after the notice, and writes nothing', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  await writeOwnerMessages(ctx.context.log, ['I cycle to work every day']);

  const written = await ctx.memory.writes.remember({
    text: 'Cycles to work',
    quote: 'I cycle to work',
    caller: buildMockWriteCaller(),
  });

  invariant(written.status === 'applied');

  await ctx.memory.remember({
    text: 'Cycles to work in summer',
    target: { itemID: written.itemID, version: 1 },
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const undo = buildTestClient(ctx.url, laptop.token).memory.undo({
    clientActionID: '0b6f3e2a-71c4-4d8e-9a5b-2f1c8e7d6a43',
    itemID: written.itemID,
    version: 1,
  });

  await undo.catch(() => {});

  const history = await ctx.memory.readHistory(written.itemID);

  const actions = await ctx.db
    .selectFrom('client_actions')
    .select('procedure')
    .where('procedure', '=', 'memory.undo')
    .execute();

  expect(undo).rejects.toMatchObject({ code: 'STALE_VERSION' });
  expect(history?.versions).toMatchObject([{ change: 'created' }, { change: 'edited' }]);
  expect(actions).toStrictEqual([]);
});

test('#memory.undo refuses a caller with no session, and writes nothing', async () => {
  const ctx = await setupTest();

  await writeOwnerMessages(ctx.context.log, ['I cycle to work every day']);

  const written = await ctx.memory.writes.remember({
    text: 'Cycles to work',
    quote: 'I cycle to work',
    caller: buildMockWriteCaller(),
  });

  invariant(written.status === 'applied');

  const before = await ctx.memory.readHistory(written.itemID);

  const undo = buildTestClient(ctx.url).memory.undo({
    clientActionID: '0b6f3e2a-71c4-4d8e-9a5b-2f1c8e7d6a43',
    itemID: written.itemID,
    version: 1,
  });

  await undo.catch(() => {});

  const after = await ctx.memory.readHistory(written.itemID);

  const actions = await ctx.db
    .selectFrom('client_actions')
    .select('procedure')
    .where('procedure', '=', 'memory.undo')
    .execute();

  expect(undo).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  expect(after).toStrictEqual(before);
  expect(actions).toStrictEqual([]);
});

test('#memory.keep refuses a caller with no session, and writes nothing', async () => {
  const ctx = await setupTest();

  await writeOwnerMessages(ctx.context.log, ['I cycle to work every day']);

  const written = await ctx.memory.writes.remember({
    text: 'Cycles to work',
    quote: 'I cycle to work',
    caller: buildMockWriteCaller(),
  });

  invariant(written.status === 'applied');

  const before = await ctx.memory.readHistory(written.itemID);

  const keep = buildTestClient(ctx.url).memory.keep({
    clientActionID: '0b6f3e2a-71c4-4d8e-9a5b-2f1c8e7d6a43',
    itemID: written.itemID,
    version: 1,
  });

  await keep.catch(() => {});

  const after = await ctx.memory.readHistory(written.itemID);

  const actions = await ctx.db
    .selectFrom('client_actions')
    .select('procedure')
    .where('procedure', '=', 'memory.keep')
    .execute();

  expect(keep).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  expect(after).toStrictEqual(before);
  expect(actions).toStrictEqual([]);
});

test('#memory.undo answers a retry with its first result and undoes once', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const client = buildTestClient(ctx.url, laptop.token);

  await writeOwnerMessages(ctx.context.log, ['I cycle to work every day']);

  const written = await ctx.memory.writes.remember({
    text: 'Cycles to work',
    quote: 'I cycle to work',
    caller: buildMockWriteCaller(),
  });

  invariant(written.status === 'applied');

  await client.memory.undo({
    clientActionID: '0b6f3e2a-71c4-4d8e-9a5b-2f1c8e7d6a43',
    itemID: written.itemID,
    version: 1,
  });

  const retried = await client.memory.undo({
    clientActionID: '0b6f3e2a-71c4-4d8e-9a5b-2f1c8e7d6a43',
    itemID: written.itemID,
    version: 1,
  });

  const history = await ctx.memory.readHistory(written.itemID);

  expect(retried).toStrictEqual({ itemID: written.itemID, version: 2 });
  expect(history?.versions).toHaveLength(2);
});

test('#memory.keep keeps the item as it is, and the notice lists it as kept', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const client = buildTestClient(ctx.url, laptop.token);

  await writeOwnerMessages(ctx.context.log, ['I cycle to work every day']);

  const written = await ctx.memory.writes.remember({
    text: 'Cycles to work',
    quote: 'I cycle to work',
    caller: buildMockWriteCaller(),
  });

  invariant(written.status === 'applied');

  await client.memory.keep({
    clientActionID: '0b6f3e2a-71c4-4d8e-9a5b-2f1c8e7d6a43',
    itemID: written.itemID,
    version: 1,
  });

  const listed = await client.memory.listNotices({ thread: 'conversation' });
  const history = await ctx.memory.readHistory(written.itemID);

  expect(listed.notices).toMatchObject([{ entries: [{ itemID: written.itemID, isKept: true }] }]);
  expect(history?.versions).toHaveLength(1);
});

test('#memory.keep refuses an item that changed after the notice', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  await writeOwnerMessages(ctx.context.log, ['I cycle to work every day']);

  const written = await ctx.memory.writes.remember({
    text: 'Cycles to work',
    quote: 'I cycle to work',
    caller: buildMockWriteCaller(),
  });

  invariant(written.status === 'applied');

  await ctx.memory.retire({
    target: { itemID: written.itemID, version: 1 },
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const keep = buildTestClient(ctx.url, laptop.token).memory.keep({
    clientActionID: '0b6f3e2a-71c4-4d8e-9a5b-2f1c8e7d6a43',
    itemID: written.itemID,
    version: 1,
  });

  await keep.catch(() => {});

  const actions = await ctx.db
    .selectFrom('client_actions')
    .select('procedure')
    .where('procedure', '=', 'memory.keep')
    .execute();

  expect(keep).rejects.toMatchObject({ code: 'STALE_VERSION' });
  expect(actions).toStrictEqual([]);
});

test("#memory.retire retires a notice's item at the version written, and leaves its retire record", async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  await writeOwnerMessages(ctx.context.log, ['I cycle to work every day']);

  const written = await ctx.memory.writes.remember({
    text: 'Cycles to work',
    quote: 'I cycle to work',
    caller: buildMockWriteCaller(),
  });

  invariant(written.status === 'applied');

  await buildTestClient(ctx.url, laptop.token).memory.retire({
    clientActionID: '0b6f3e2a-71c4-4d8e-9a5b-2f1c8e7d6a43',
    itemID: written.itemID,
    version: 1,
  });

  const history = await ctx.memory.readHistory(written.itemID);

  expect(history).toMatchObject({
    state: 'retired',
    versions: [{ change: 'created' }, { change: 'retired', origin: 'owner', state: 'retired' }],
  });
});
