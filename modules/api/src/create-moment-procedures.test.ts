import { expect, mock, onTestFinished, test } from 'bun:test';
import { readRecords, writeRecords } from '@heynixie/log';
import type { CleanupSessions } from '@heynixie/memory';
import {
  defaultGateLimits,
  defaultOwnerPronouns,
  findNoAllowRule,
  startMemoryStore,
} from '@heynixie/memory';
import invariant from 'tiny-invariant';
import { buildTestClient } from './test-utils/build-test-client';
import { createDeviceSession } from './test-utils/create-device-session';
import { startTestAPI } from './test-utils/start-test-api';

async function setupTest() {
  const api = await startTestAPI();

  const cleanupSessions = mock<CleanupSessions>(() => Promise.resolve());

  const memory = await startMemoryStore({
    log: api.context.log,
    definitions: () => ({ snapshotHash: 'sha256:test' }),
    cleanupSessions,
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
      getPromptsInForce: () => ({ snapshotHash: 'sha256:test', prompts: {} }),
    },
  });

  onTestFinished(() => memory.stop());

  api.setMemory(memory);

  return { ...api, memory, cleanupSessions };
}

test('#memory.keepMoment keeps the span with its title as a moment the user kept', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const client = buildTestClient(ctx.url, laptop.token);

  const [message, reply] = await writeRecords(ctx.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the boiler gave out on the coldest night' },
    },
    {
      kind: 'model.reply',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Blankets first, then the engineer.' },
    },
  ]);

  invariant(message && reply);

  const kept = await client.memory.keepMoment({
    clientActionID: '3b9e2f61-4c7a-4d8e-9f10-5a6b7c8d9e0f',
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: reply.sequence,
    title: 'The night the boiler gave out',
  });

  const read = await ctx.memory.moments.read({
    momentID: kept.momentID,
    after: null,
    tokenCap: 1000,
  });

  const [record] = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['moment_kept'],
  });

  expect(read?.row.short_id).toBe(kept.shortID);
  expect(read?.title).toBe('The night the boiler gave out');
  expect(record?.record.thread).toBeNull();
  expect(record?.record.payload).toMatchObject({ keptBy: 'owner', keptThread: null });
});

test("#memory.keepMoment answers a retry with the first keep's IDs, and keeps one moment", async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const client = buildTestClient(ctx.url, laptop.token);

  const [message] = await writeRecords(ctx.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the boiler gave out on the coldest night' },
    },
  ]);

  invariant(message);

  const first = await client.memory.keepMoment({
    clientActionID: '3b9e2f61-4c7a-4d8e-9f10-5a6b7c8d9e0f',
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The night the boiler gave out',
  });

  const retried = await client.memory.keepMoment({
    clientActionID: '3b9e2f61-4c7a-4d8e-9f10-5a6b7c8d9e0f',
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The night the boiler gave out',
  });

  const records = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['moment_kept'],
  });

  expect(retried).toStrictEqual(first);
  expect(records).toHaveLength(1);
});

test('#memory.keepMoment refuses a span that is not on the thread, and records no client action', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const client = buildTestClient(ctx.url, laptop.token);

  const [message, wake] = await writeRecords(ctx.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the boiler gave out on the coldest night' },
    },
    {
      kind: 'task.wake',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'task-heating',
      payload: {},
    },
  ]);

  invariant(message && wake);

  const refused = client.memory.keepMoment({
    clientActionID: '3b9e2f61-4c7a-4d8e-9f10-5a6b7c8d9e0f',
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: wake.sequence,
    title: 'The night the boiler gave out',
  });

  await refused.catch(() => {});

  const kept = await client.memory.keepMoment({
    clientActionID: '3b9e2f61-4c7a-4d8e-9f10-5a6b7c8d9e0f',
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The night the boiler gave out',
  });

  expect(refused).rejects.toMatchObject({ code: 'BAD_SPAN' });
  expect(kept.shortID).toBeString();
});

test('#memory.keepMoment refuses a client action ID that another change used, and keeps nothing', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const client = buildTestClient(ctx.url, laptop.token);

  const item = await ctx.memory.remember({
    text: 'Has a gas boiler',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const [message] = await writeRecords(ctx.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the boiler gave out on the coldest night' },
    },
  ]);

  invariant(message);

  await client.memory.retire({ clientActionID: '3b9e2f61-4c7a-4d8e-9f10-5a6b7c8d9e0f', ...item });

  const keep = client.memory.keepMoment({
    clientActionID: '3b9e2f61-4c7a-4d8e-9f10-5a6b7c8d9e0f',
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The night the boiler gave out',
  });

  await keep.catch(() => {});

  const records = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['moment_kept'],
  });

  expect(keep).rejects.toMatchObject({ code: 'CLIENT_ACTION_ID_REUSED' });
  expect(records).toStrictEqual([]);
});

test.each([
  ['no session token', undefined],
  ['a token that no session holds', 'f3a9c1e2b7d84605a1c9e2f3b4d5c6a7'],
  ['an empty bearer token', ''],
])('#memory.keepMoment refuses a caller with %s, and keeps nothing', async (_, token) => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the boiler gave out on the coldest night' },
    },
  ]);

  invariant(message);

  const keep = buildTestClient(ctx.url, token).memory.keepMoment({
    clientActionID: '3b9e2f61-4c7a-4d8e-9f10-5a6b7c8d9e0f',
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The night the boiler gave out',
  });

  await keep.catch(() => {});

  const records = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['moment_kept'],
  });

  expect(keep).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  expect(records).toStrictEqual([]);
});

test('#memory.keepMoment refuses a caller whose session another device revoked, and keeps nothing', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');
  const phone = await createDeviceSession(ctx.context, 'phone');

  const [message] = await writeRecords(ctx.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the boiler gave out on the coldest night' },
    },
  ]);

  invariant(message);

  await buildTestClient(ctx.url, laptop.token).sessions.revoke({
    clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    sessionID: phone.sessionID,
  });

  const keep = buildTestClient(ctx.url, phone.token).memory.keepMoment({
    clientActionID: '3b9e2f61-4c7a-4d8e-9f10-5a6b7c8d9e0f',
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The night the boiler gave out',
  });

  await keep.catch(() => {});

  const records = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['moment_kept'],
  });

  expect(keep).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  expect(records).toStrictEqual([]);
});

test('#memory.previewMomentDestroy shows the text the destroy shreds and the span records it keeps', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const client = buildTestClient(ctx.url, laptop.token);

  const [message, reply] = await writeRecords(ctx.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'we planted the quince by the back wall' },
    },
    {
      kind: 'model.reply',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'A good spot for it.' },
    },
  ]);

  invariant(message && reply);

  const kept = await ctx.memory.moments.keep({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: reply.sequence,
    title: 'The quince tree',
  });

  invariant(kept.status === 'written');

  await ctx.memory.moments.edit({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    target: { momentID: kept.momentID, version: 1 },
    change: { kind: 'reflection', text: 'Planting it was a promise to stay.' },
  });

  const preview = await client.memory.previewMomentDestroy({
    momentID: kept.momentID,
    version: 2,
  });

  expect(preview).toStrictEqual({
    momentID: kept.momentID,
    shortID: kept.shortID,
    version: 2,
    state: 'active',
    thread: 'conversation',
    keptBy: 'model',
    keptAt: expect.toBeValidDate(),
    title: 'The quince tree',
    note: null,
    reflections: [
      {
        model: 'claude-test-4',
        text: 'Planting it was a promise to stay.',
        writtenAt: expect.toBeValidDate(),
      },
    ],
    lost: { texts: 2, links: 0 },
    kept: { records: 2 },
  });
});

test('#memory.previewMomentDestroy refuses a version the moment moved past', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const client = buildTestClient(ctx.url, laptop.token);

  const [message] = await writeRecords(ctx.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'we planted the quince by the back wall' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The quince tree',
  });

  invariant(kept.status === 'written');

  await ctx.memory.moments.retire({
    caller: { kind: 'owner' },
    target: { momentID: kept.momentID, version: 1 },
    isRetired: true,
  });

  const preview = client.memory.previewMomentDestroy({ momentID: kept.momentID, version: 1 });

  await preview.catch(() => {});

  expect(preview).rejects.toMatchObject({ code: 'STALE_VERSION' });
});

test("#memory.previewMomentDestroy refuses a caller with no session, and shows none of the moment's text", async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'we planted the quince by the back wall' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The quince tree',
  });

  invariant(kept.status === 'written');

  const preview = buildTestClient(ctx.url).memory.previewMomentDestroy({
    momentID: kept.momentID,
    version: 1,
  });

  await preview.catch(() => {});

  expect(preview).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('#memory.previewMomentDestroy answers a signed-in caller with MEMORY_NOT_STARTED before the store starts', async () => {
  const api = await startTestAPI();
  const laptop = await createDeviceSession(api.context, 'laptop');

  const preview = buildTestClient(api.url, laptop.token).memory.previewMomentDestroy({
    momentID: 'moment-a',
    version: 1,
  });

  await preview.catch(() => {});

  expect(preview).rejects.toMatchObject({ code: 'MEMORY_NOT_STARTED', status: 503 });
});

test('#memory.previewMomentDestroy refuses a moment that does not exist', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const preview = buildTestClient(ctx.url, laptop.token).memory.previewMomentDestroy({
    momentID: 'no-such-moment',
    version: 1,
  });

  await preview.catch(() => {});

  expect(preview).rejects.toMatchObject({ code: 'MOMENT_NOT_FOUND' });
});

test('#memory.destroyMoment answers a signed-in caller with MEMORY_NOT_STARTED before the store starts', async () => {
  const api = await startTestAPI();
  const laptop = await createDeviceSession(api.context, 'laptop');

  const destroy = buildTestClient(api.url, laptop.token).memory.destroyMoment({
    clientActionID: '7a3e1c52-9d4b-4f0e-b8a6-2c5d9e1f3a74',
    momentID: 'moment-a',
    version: 1,
  });

  await destroy.catch(() => {});

  expect(destroy).rejects.toMatchObject({ code: 'MEMORY_NOT_STARTED', status: 503 });
});

test('#memory.destroyMoment shreds the title, cleans up the sessions and records the destroy as complete', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const client = buildTestClient(ctx.url, laptop.token);

  const [message] = await writeRecords(ctx.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'we planted the quince by the back wall' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The quince tree',
  });

  invariant(kept.status === 'written');

  const destroyed = await client.memory.destroyMoment({
    clientActionID: '7a3e1c52-9d4b-4f0e-b8a6-2c5d9e1f3a74',
    momentID: kept.momentID,
    version: 1,
  });

  const records = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['owner_message', 'moment_kept', 'moment_destroyed'],
  });

  expect(destroyed).toStrictEqual({ momentID: kept.momentID });
  expect(ctx.cleanupSessions).toHaveBeenCalledExactlyOnceWith({ momentID: kept.momentID });

  expect(records.map((entry) => [entry.record.kind, entry.record.erasable.status])).toStrictEqual([
    ['owner_message', 'readable'],
    ['moment_kept', 'shredded'],
    ['moment_destroyed', 'none'],
    ['moment_destroyed', 'none'],
  ]);
});

test('#memory.destroyMoment completes a destroy on the retry after its session cleanup failed', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const client = buildTestClient(ctx.url, laptop.token);

  const [message] = await writeRecords(ctx.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'we planted the quince by the back wall' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The quince tree',
  });

  invariant(kept.status === 'written');

  ctx.cleanupSessions.mockImplementationOnce(() =>
    Promise.reject(new Error('the guest did not answer')),
  );

  const failed = await client.memory
    .destroyMoment({
      clientActionID: '7a3e1c52-9d4b-4f0e-b8a6-2c5d9e1f3a74',
      momentID: kept.momentID,
      version: 1,
    })
    .catch((error: unknown) => error);

  const retried = await client.memory.destroyMoment({
    clientActionID: '7a3e1c52-9d4b-4f0e-b8a6-2c5d9e1f3a74',
    momentID: kept.momentID,
    version: 1,
  });

  const records = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['moment_destroyed'],
  });

  expect(failed).toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
  expect(retried).toStrictEqual({ momentID: kept.momentID });
  expect(records).toHaveLength(2);
});

test('#memory.destroyMoment refuses a destroy confirmed after the moment changed, and records no client action', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const client = buildTestClient(ctx.url, laptop.token);

  const [message] = await writeRecords(ctx.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'we planted the quince by the back wall' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The quince tree',
  });

  invariant(kept.status === 'written');

  await ctx.memory.moments.edit({
    caller: { kind: 'owner' },
    target: { momentID: kept.momentID, version: 1 },
    change: { kind: 'note', note: 'It flowered in its second spring.' },
  });

  const stale = client.memory.destroyMoment({
    clientActionID: '7a3e1c52-9d4b-4f0e-b8a6-2c5d9e1f3a74',
    momentID: kept.momentID,
    version: 1,
  });

  await stale.catch(() => {});

  const current = await client.memory.destroyMoment({
    clientActionID: '7a3e1c52-9d4b-4f0e-b8a6-2c5d9e1f3a74',
    momentID: kept.momentID,
    version: 2,
  });

  expect(stale).rejects.toMatchObject({ code: 'STALE_VERSION' });
  expect(current).toStrictEqual({ momentID: kept.momentID });
});

test('#memory.destroyMoment refuses a moment that does not exist', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const destroy = buildTestClient(ctx.url, laptop.token).memory.destroyMoment({
    clientActionID: '7a3e1c52-9d4b-4f0e-b8a6-2c5d9e1f3a74',
    momentID: 'no-such-moment',
    version: 1,
  });

  await destroy.catch(() => {});

  expect(destroy).rejects.toMatchObject({ code: 'MOMENT_NOT_FOUND' });
});

test('#memory.destroyMoment refuses a client action ID that another change used, and destroys nothing', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const client = buildTestClient(ctx.url, laptop.token);

  const item = await ctx.memory.remember({
    text: 'Grows a quince by the back wall',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const [message] = await writeRecords(ctx.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'we planted the quince by the back wall' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The quince tree',
  });

  invariant(kept.status === 'written');

  await client.memory.retire({ clientActionID: '7a3e1c52-9d4b-4f0e-b8a6-2c5d9e1f3a74', ...item });

  const destroy = client.memory.destroyMoment({
    clientActionID: '7a3e1c52-9d4b-4f0e-b8a6-2c5d9e1f3a74',
    momentID: kept.momentID,
    version: 1,
  });

  await destroy.catch(() => {});

  const read = await ctx.memory.moments.read({
    momentID: kept.momentID,
    after: null,
    tokenCap: 1000,
  });

  expect(destroy).rejects.toMatchObject({ code: 'CLIENT_ACTION_ID_REUSED' });
  expect(read?.title).toBe('The quince tree');
});

test.each([
  ['no session token', undefined],
  ['a token that no session holds', 'f3a9c1e2b7d84605a1c9e2f3b4d5c6a7'],
  ['an empty bearer token', ''],
])('#memory.destroyMoment refuses a caller with %s, and destroys nothing', async (_, token) => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'we planted the quince by the back wall' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The quince tree',
  });

  invariant(kept.status === 'written');

  const destroy = buildTestClient(ctx.url, token).memory.destroyMoment({
    clientActionID: '7a3e1c52-9d4b-4f0e-b8a6-2c5d9e1f3a74',
    momentID: kept.momentID,
    version: 1,
  });

  await destroy.catch(() => {});

  const read = await ctx.memory.moments.read({
    momentID: kept.momentID,
    after: null,
    tokenCap: 1000,
  });

  expect(destroy).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  expect(read?.title).toBe('The quince tree');
});
