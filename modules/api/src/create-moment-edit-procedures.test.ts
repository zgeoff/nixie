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
import { readClientAction } from './read-client-action';
import { buildTestClient } from './test-utils/build-test-client';
import { createDeviceSession } from './test-utils/create-device-session';
import { startTestAPI } from './test-utils/start-test-api';

async function setupTest() {
  const api = await startTestAPI();

  const memory = await startMemoryStore({
    log: api.context.log,
    definitions: () => ({ snapshotHash: 'sha256:test' }),
    cleanupSessions: mock<CleanupSessions>(() => Promise.resolve()),
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

  return { ...api, memory };
}

test('#memory.editMoment renames a moment as the user', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const client = buildTestClient(ctx.url, laptop.token);

  const [message] = await writeRecords(ctx.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the radio only gets one station now' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.moments.keep({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The radio',
  });

  invariant(kept.status === 'written');

  const edited = await client.memory.editMoment({
    clientActionID: '6e1f3a92-4c7d-4b0a-9e58-3d2c1b0a9f87',
    momentID: kept.momentID,
    version: 1,
    change: { kind: 'title', title: 'The one-station radio' },
  });

  const read = await client.memory.readMoment({ momentID: kept.momentID });

  expect(edited).toStrictEqual({ momentID: kept.momentID, version: 2 });
  expect(read.title).toBe('The one-station radio');
  expect(read.titleBy).toBe('owner');
});

test("#memory.editMoment moves the span's edges within its thread", async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const client = buildTestClient(ctx.url, laptop.token);

  const [message, reply] = await writeRecords(ctx.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the radio only gets one station now' },
    },
    {
      kind: 'model.reply',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'The aerial may have come loose.' },
    },
  ]);

  invariant(message && reply);

  const kept = await ctx.memory.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The radio',
  });

  invariant(kept.status === 'written');

  await client.memory.editMoment({
    clientActionID: '6e1f3a92-4c7d-4b0a-9e58-3d2c1b0a9f87',
    momentID: kept.momentID,
    version: 1,
    change: { kind: 'edges', firstSequence: message.sequence, lastSequence: reply.sequence },
  });

  const read = await client.memory.readMoment({ momentID: kept.momentID });

  expect(read.lastSequence).toBe(reply.sequence);
});

test('#memory.editMoment removes a reflection, which the moment then no longer shows', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const client = buildTestClient(ctx.url, laptop.token);

  const [message] = await writeRecords(ctx.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the radio only gets one station now' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.moments.keep({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The radio',
  });

  invariant(kept.status === 'written');

  const reflected = await ctx.memory.moments.edit({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    target: { momentID: kept.momentID, version: 1 },
    change: { kind: 'reflection', text: 'The fault was the aerial.' },
  });

  invariant(reflected.status === 'written' && reflected.reflectionID !== undefined);

  await client.memory.editMoment({
    clientActionID: '6e1f3a92-4c7d-4b0a-9e58-3d2c1b0a9f87',
    momentID: kept.momentID,
    version: 2,
    change: { kind: 'reflection_removed', reflectionID: reflected.reflectionID },
  });

  const read = await client.memory.readMoment({ momentID: kept.momentID });

  expect(read.reflections).toStrictEqual([]);
});

test("#memory.editMoment answers a retry with the first edit's result, and edits once", async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const client = buildTestClient(ctx.url, laptop.token);

  const [message] = await writeRecords(ctx.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the radio only gets one station now' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The radio',
  });

  invariant(kept.status === 'written');

  const edit = {
    clientActionID: '6e1f3a92-4c7d-4b0a-9e58-3d2c1b0a9f87',
    momentID: kept.momentID,
    version: 1,
    change: { kind: 'note' as const, note: 'The station was the news one.' },
  };

  const first = await client.memory.editMoment(edit);
  const retried = await client.memory.editMoment(edit);

  const records = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['moment_edited'],
  });

  expect(retried).toStrictEqual(first);
  expect(records).toHaveLength(1);
});

test('#memory.editMoment refuses an edit to a version the moment moved past, and records no client action', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const client = buildTestClient(ctx.url, laptop.token);

  const [message] = await writeRecords(ctx.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the radio only gets one station now' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The radio',
  });

  invariant(kept.status === 'written');

  await ctx.memory.moments.edit({
    caller: { kind: 'owner' },
    target: { momentID: kept.momentID, version: 1 },
    change: { kind: 'title', title: 'The old radio' },
  });

  const stale = client.memory.editMoment({
    clientActionID: '6e1f3a92-4c7d-4b0a-9e58-3d2c1b0a9f87',
    momentID: kept.momentID,
    version: 1,
    change: { kind: 'note', note: 'The station was the news one.' },
  });

  await stale.catch(() => {});

  const action = await readClientAction(
    ctx.context.log.writer.db,
    '6e1f3a92-4c7d-4b0a-9e58-3d2c1b0a9f87',
  );

  expect(stale).rejects.toMatchObject({ code: 'STALE_VERSION' });
  expect(action).toBeNull();
});

test('#memory.editMoment refuses edges off the thread', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const [message, aside] = await writeRecords(ctx.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the radio only gets one station now' },
    },
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'morning-reading',
      erasable: { text: 'a story about radio masts' },
    },
  ]);

  invariant(message && aside);

  const kept = await ctx.memory.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The radio',
  });

  invariant(kept.status === 'written');

  const edited = buildTestClient(ctx.url, laptop.token).memory.editMoment({
    clientActionID: '6e1f3a92-4c7d-4b0a-9e58-3d2c1b0a9f87',
    momentID: kept.momentID,
    version: 1,
    change: { kind: 'edges', firstSequence: message.sequence, lastSequence: aside.sequence },
  });

  await edited.catch(() => {});

  expect(edited).rejects.toMatchObject({ code: 'BAD_SPAN' });
});

test('#memory.editMoment refuses to remove a reflection the moment does not hold', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const [message] = await writeRecords(ctx.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the radio only gets one station now' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The radio',
  });

  invariant(kept.status === 'written');

  const edited = buildTestClient(ctx.url, laptop.token).memory.editMoment({
    clientActionID: '6e1f3a92-4c7d-4b0a-9e58-3d2c1b0a9f87',
    momentID: kept.momentID,
    version: 1,
    change: { kind: 'reflection_removed', reflectionID: 'r8k2m4p6q1' },
  });

  await edited.catch(() => {});

  expect(edited).rejects.toMatchObject({ code: 'REFLECTION_NOT_FOUND' });
});

test.each([
  ['no session token', undefined],
  ['a token that no session holds', 'f3a9c1e2b7d84605a1c9e2f3b4d5c6a7'],
  ['an empty bearer token', ''],
])('#memory.editMoment refuses a caller with %s, and edits nothing', async (_, token) => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the radio only gets one station now' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The radio',
  });

  invariant(kept.status === 'written');

  const edited = buildTestClient(ctx.url, token).memory.editMoment({
    clientActionID: '6e1f3a92-4c7d-4b0a-9e58-3d2c1b0a9f87',
    momentID: kept.momentID,
    version: 1,
    change: { kind: 'title', title: 'The one-station radio' },
  });

  await edited.catch(() => {});

  const records = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['moment_edited'],
  });

  expect(edited).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  expect(records).toStrictEqual([]);
});

test('#memory.editMoment refuses a caller whose session another device revoked, and edits nothing', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');
  const phone = await createDeviceSession(ctx.context, 'phone');

  const [message] = await writeRecords(ctx.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the radio only gets one station now' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The radio',
  });

  invariant(kept.status === 'written');

  await buildTestClient(ctx.url, laptop.token).sessions.revoke({
    clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    sessionID: phone.sessionID,
  });

  const edited = buildTestClient(ctx.url, phone.token).memory.editMoment({
    clientActionID: '6e1f3a92-4c7d-4b0a-9e58-3d2c1b0a9f87',
    momentID: kept.momentID,
    version: 1,
    change: { kind: 'title', title: 'The one-station radio' },
  });

  await edited.catch(() => {});

  const records = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['moment_edited'],
  });

  expect(edited).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  expect(records).toStrictEqual([]);
});

test('#memory.linkMoment links a memory item that the user names by its short ID', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const client = buildTestClient(ctx.url, laptop.token);

  const [message] = await writeRecords(ctx.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the radio only gets one station now' },
    },
  ]);

  invariant(message);

  const item = await ctx.memory.remember({
    text: 'Listens to the news at seven',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const shortIDs = await ctx.memory.readShortIDs([item.itemID]);

  const shortID = shortIDs.get(item.itemID);

  invariant(shortID !== undefined);

  const kept = await ctx.memory.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The radio',
  });

  invariant(kept.status === 'written');

  await client.memory.linkMoment({
    clientActionID: '6e1f3a92-4c7d-4b0a-9e58-3d2c1b0a9f87',
    momentID: kept.momentID,
    version: 1,
    itemID: shortID,
    isLinked: true,
  });

  const read = await client.memory.readMoment({ momentID: kept.momentID });

  expect(read.links).toStrictEqual([
    { itemID: item.itemID, shortID, text: 'Listens to the news at seven' },
  ]);
});

test.each([
  ['no session token', undefined],
  ['a token that no session holds', 'f3a9c1e2b7d84605a1c9e2f3b4d5c6a7'],
  ['an empty bearer token', ''],
])('#memory.linkMoment refuses a caller with %s, and links nothing', async (_, token) => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the radio only gets one station now' },
    },
  ]);

  invariant(message);

  const item = await ctx.memory.remember({
    text: 'Listens to the news at seven',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const shortIDs = await ctx.memory.readShortIDs([item.itemID]);

  const shortID = shortIDs.get(item.itemID);

  invariant(shortID !== undefined);

  const kept = await ctx.memory.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The radio',
  });

  invariant(kept.status === 'written');

  const linked = buildTestClient(ctx.url, token).memory.linkMoment({
    clientActionID: '6e1f3a92-4c7d-4b0a-9e58-3d2c1b0a9f87',
    momentID: kept.momentID,
    version: 1,
    itemID: shortID,
    isLinked: true,
  });

  await linked.catch(() => {});

  const records = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['moment_linked'],
  });

  expect(linked).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  expect(records).toStrictEqual([]);
});

test('#memory.linkMoment removes a link', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const client = buildTestClient(ctx.url, laptop.token);

  const [message] = await writeRecords(ctx.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the radio only gets one station now' },
    },
  ]);

  invariant(message);

  const item = await ctx.memory.remember({
    text: 'Listens to the news at seven',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const kept = await ctx.memory.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The radio',
  });

  invariant(kept.status === 'written');

  await ctx.memory.moments.link({
    caller: { kind: 'owner' },
    target: { momentID: kept.momentID, version: 1 },
    itemID: item.itemID,
    isLinked: true,
  });

  await client.memory.linkMoment({
    clientActionID: '6e1f3a92-4c7d-4b0a-9e58-3d2c1b0a9f87',
    momentID: kept.momentID,
    version: 2,
    itemID: item.itemID,
    isLinked: false,
  });

  const read = await client.memory.readMoment({ momentID: kept.momentID });

  expect(read.links).toStrictEqual([]);
});

test('#memory.linkMoment refuses an item that does not exist', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const [message] = await writeRecords(ctx.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the radio only gets one station now' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The radio',
  });

  invariant(kept.status === 'written');

  const linked = buildTestClient(ctx.url, laptop.token).memory.linkMoment({
    clientActionID: '6e1f3a92-4c7d-4b0a-9e58-3d2c1b0a9f87',
    momentID: kept.momentID,
    version: 1,
    itemID: 'zz99zz',
    isLinked: true,
  });

  await linked.catch(() => {});

  expect(linked).rejects.toMatchObject({ code: 'MEMORY_ITEM_NOT_FOUND' });
});

test('#memory.linkMoment refuses an item already linked', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const [message] = await writeRecords(ctx.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the radio only gets one station now' },
    },
  ]);

  invariant(message);

  const item = await ctx.memory.remember({
    text: 'Listens to the news at seven',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const kept = await ctx.memory.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The radio',
  });

  invariant(kept.status === 'written');

  await ctx.memory.moments.link({
    caller: { kind: 'owner' },
    target: { momentID: kept.momentID, version: 1 },
    itemID: item.itemID,
    isLinked: true,
  });

  const linked = buildTestClient(ctx.url, laptop.token).memory.linkMoment({
    clientActionID: '6e1f3a92-4c7d-4b0a-9e58-3d2c1b0a9f87',
    momentID: kept.momentID,
    version: 2,
    itemID: item.itemID,
    isLinked: true,
  });

  await linked.catch(() => {});

  expect(linked).rejects.toMatchObject({ code: 'ALREADY_LINKED' });
});

test('#memory.linkMoment refuses to remove a link that does not exist', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const [message] = await writeRecords(ctx.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the radio only gets one station now' },
    },
  ]);

  invariant(message);

  const item = await ctx.memory.remember({
    text: 'Listens to the news at seven',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const kept = await ctx.memory.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The radio',
  });

  invariant(kept.status === 'written');

  const linked = buildTestClient(ctx.url, laptop.token).memory.linkMoment({
    clientActionID: '6e1f3a92-4c7d-4b0a-9e58-3d2c1b0a9f87',
    momentID: kept.momentID,
    version: 1,
    itemID: item.itemID,
    isLinked: false,
  });

  await linked.catch(() => {});

  expect(linked).rejects.toMatchObject({ code: 'NOT_LINKED' });
});
