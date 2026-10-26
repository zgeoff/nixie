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

test('#memory.destroyMoment refuses a caller with no session', async () => {
  const ctx = await setupTest();

  const destroy = buildTestClient(ctx.url).memory.destroyMoment({
    clientActionID: '7a3e1c52-9d4b-4f0e-b8a6-2c5d9e1f3a74',
    momentID: 'moment-a',
    version: 1,
  });

  await destroy.catch(() => {});

  expect(destroy).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});
