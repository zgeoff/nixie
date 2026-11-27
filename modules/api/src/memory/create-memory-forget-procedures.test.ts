import { expect, mock, onTestFinished, test } from 'bun:test';
import type { ErasureSessionCause } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { defaultGateLimits, defaultOwnerPronouns, startMemoryStore } from '@heynixie/memory';
import invariant from 'tiny-invariant';
import { buildTestClient } from '../test-utils/build-test-client';
import { buildTestErasureRunner } from '../test-utils/build-test-erasure-runner';
import { createDeviceSession } from '../test-utils/create-device-session';
import { seedPublishedBackupSet } from '../test-utils/seed-published-backup-set';
import { startTestAPI } from '../test-utils/start-test-api';
import type { APITables } from '../types';

async function setupTest() {
  const api = await startTestAPI();

  const cleanupSessions = mock<(cause: ErasureSessionCause) => Promise<void>>(() =>
    Promise.resolve(),
  );

  const memory = await startMemoryStore({
    log: api.context.log,
    definitions: () => ({ snapshotHash: 'sha256:test' }),
    erasure: buildTestErasureRunner(api.context.log, cleanupSessions),
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

test('#memory.previewForget shows the item with every version and what its forget destroys', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const client = buildTestClient(ctx.url, laptop.token);

  const item = await ctx.memory.remember({
    text: 'Plays the cello on Thursdays',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const retired = await ctx.memory.retire({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const preview = await client.memory.previewForget(retired);

  expect(preview).toMatchObject({
    itemID: item.itemID,
    state: 'retired',
    version: 2,
    versions: [
      { version: 1, change: 'created', text: 'Plays the cello on Thursdays' },
      { version: 2, change: 'retired', text: 'Plays the cello on Thursdays' },
    ],
    lost: { evidenceMessages: 0, proposals: 0 },
  });
});

test('#memory.previewForget refuses a version the item moved past', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const client = buildTestClient(ctx.url, laptop.token);

  const item = await ctx.memory.remember({
    text: 'Plays the cello on Thursdays',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.retire({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const preview = client.memory.previewForget(item);

  await preview.catch(() => {});

  expect(preview).rejects.toMatchObject({ code: 'STALE_VERSION' });
});

test('#memory.previewForget refuses an item that does not exist', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const client = buildTestClient(ctx.url, laptop.token);
  const preview = client.memory.previewForget({ itemID: 'no-such-item', version: 1 });

  await preview.catch(() => {});

  expect(preview).rejects.toMatchObject({ code: 'MEMORY_ITEM_NOT_FOUND' });
});

test('#memory.forget forgets the item at the version its preview showed, so every version reads as a gap', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const client = buildTestClient(ctx.url, laptop.token);

  const item = await ctx.memory.remember({
    text: 'The shed padlock code is 2291',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const preview = await client.memory.previewForget(item);

  const forgotten = await client.memory.forget({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    itemID: item.itemID,
    version: preview.version,
  });

  const history = await ctx.memory.readHistory(item.itemID);

  expect(forgotten).toStrictEqual({
    itemID: item.itemID,
    pending: false,
    backup: { state: 'pending' },
  });

  expect(history).toMatchObject({ state: 'forgotten', versions: [{ status: 'shredded' }] });
});

test('#memory.forget drops the item from the index, so a search no longer finds it', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const client = buildTestClient(ctx.url, laptop.token);

  const item = await ctx.memory.remember({
    text: 'The shed padlock code is 2291',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await client.memory.forget({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    ...item,
  });

  const found = await ctx.memory.view.readMatchingItems('padlock');

  expect(found.items).toStrictEqual([]);
});

test('#memory.forget cleans up the sessions, then records the forget as complete', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const client = buildTestClient(ctx.url, laptop.token);

  const item = await ctx.memory.remember({
    text: 'The shed padlock code is 2291',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await client.memory.forget({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    ...item,
  });

  const records = await readRecords(ctx.context.log, { afterSequence: 0 });

  expect(ctx.cleanupSessions).toHaveBeenCalledExactlyOnceWith({ itemID: item.itemID });

  expect(
    records.map((entry) => entry.record.kind).filter((kind) => kind.startsWith('memory.')),
  ).toStrictEqual(['memory.version_added', 'memory.version_keyed']);

  expect(
    records.map((entry) => entry.record.kind).filter((kind) => kind.startsWith('erasure.')),
  ).toStrictEqual(['erasure.started', 'erasure.finished']);
});

test('#memory.forget replies pending when its session cleanup failed, and a retry with the same client action completes it', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const client = buildTestClient(ctx.url, laptop.token);

  const item = await ctx.memory.remember({
    text: 'The shed padlock code is 2291',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  ctx.cleanupSessions.mockImplementationOnce(() =>
    Promise.reject(new Error('the guest did not answer')),
  );

  const pending = await client.memory.forget({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    ...item,
  });

  const stateAfterFailure = await ctx.memory.view.readForgetStatus([item.itemID]);

  const retried = await client.memory.forget({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    ...item,
  });

  const history = await ctx.memory.readHistory(item.itemID);

  expect(pending).toStrictEqual({
    itemID: item.itemID,
    pending: true,
    backup: { state: 'pending' },
  });

  expect(stateAfterFailure).toMatchObject({ deleted: [], pending: [item.itemID] });

  expect(retried).toStrictEqual({
    itemID: item.itemID,
    pending: false,
    backup: { state: 'pending' },
  });

  expect(history?.state).toBe('forgotten');
});

test('#memory.forget joins the open erasure of an item for a request with a fresh client action', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const client = buildTestClient(ctx.url, laptop.token);

  const item = await ctx.memory.remember({
    text: 'The shed padlock code is 2291',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  ctx.cleanupSessions.mockImplementationOnce(() =>
    Promise.reject(new Error('the guest did not answer')),
  );

  await client.memory.forget({ clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85', ...item });

  const joined = await client.memory.forget({
    clientActionID: '0b8e4d6a-2c1f-4a7e-9d35-7e1a6c4b8f20',
    ...item,
  });

  const records = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['erasure.started', 'erasure.finished'],
  });

  const history = await ctx.memory.readHistory(item.itemID);

  expect(joined).toStrictEqual({
    itemID: item.itemID,
    pending: false,
    backup: { state: 'pending' },
  });

  expect(records.map((entry) => entry.record.kind)).toStrictEqual([
    'erasure.started',
    'erasure.finished',
  ]);

  expect(history?.state).toBe('forgotten');
});

test('#memory.forget refuses a forget confirmed after the item changed, and keeps every version readable', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const client = buildTestClient(ctx.url, laptop.token);

  const item = await ctx.memory.remember({
    text: 'The shed padlock code is 2291',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const preview = await client.memory.previewForget(item);

  await ctx.memory.remember({
    text: 'The shed padlock code is 7730',
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const forget = client.memory.forget({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    itemID: item.itemID,
    version: preview.version,
  });

  await forget.catch(() => {});

  const detail = await ctx.memory.view.readItem(item.itemID);

  expect(forget).rejects.toMatchObject({ code: 'STALE_VERSION' });

  expect(detail).toMatchObject({
    state: 'active',
    versions: [
      { status: 'readable', text: 'The shed padlock code is 2291' },
      { status: 'readable', text: 'The shed padlock code is 7730' },
    ],
  });
});

test('#memory.forget begins no forget and cleans up no session for a stale confirmation', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const client = buildTestClient(ctx.url, laptop.token);

  const item = await ctx.memory.remember({
    text: 'The shed padlock code is 2291',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.remember({
    text: 'The shed padlock code is 7730',
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const forget = client.memory.forget({ clientActionID: crypto.randomUUID(), ...item });

  await forget.catch(() => {});

  const records = await readRecords(ctx.context.log, { afterSequence: 0 });

  expect(ctx.cleanupSessions).not.toHaveBeenCalled();

  expect(
    records.map((entry) => entry.record.kind).filter((kind) => kind.startsWith('memory.')),
  ).toStrictEqual([
    'memory.version_added',
    'memory.version_keyed',
    'memory.version_added',
    'memory.version_keyed',
  ]);
});

test('#memory.forget keeps the item in the index for a stale confirmation', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const client = buildTestClient(ctx.url, laptop.token);

  const item = await ctx.memory.remember({
    text: 'The shed padlock code is 2291',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.remember({
    text: 'The shed padlock code is 7730',
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const forget = client.memory.forget({ clientActionID: crypto.randomUUID(), ...item });

  await forget.catch(() => {});

  const found = await ctx.memory.view.readMatchingItems('padlock');

  expect(found.items.map((match) => match.itemID)).toStrictEqual([item.itemID]);
});

test('#memory.forget refuses a client action ID that another change used, and forgets nothing', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const client = buildTestClient(ctx.url, laptop.token);

  const first = await ctx.memory.remember({
    text: 'Rents a flat on Mill Lane',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const second = await ctx.memory.remember({
    text: 'The shed padlock code is 2291',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await client.memory.retire({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    ...first,
  });

  const forget = client.memory.forget({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    ...second,
  });

  await forget.catch(() => {});

  const history = await ctx.memory.readHistory(second.itemID);

  expect(forget).rejects.toMatchObject({ code: 'CLIENT_ACTION_ID_REUSED' });
  expect(history?.state).toBe('active');
});

test('#memory.forget replies with the same result when a completed request repeats with its client action ID and input', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const client = buildTestClient(ctx.url, laptop.token);

  const item = await ctx.memory.remember({
    text: 'Keeps a spare key under the blue pot',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const input = { clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85', ...item };

  const first = await client.memory.forget(input);
  const replay = await client.memory.forget(input);

  expect(replay).toStrictEqual(first);
});

test('#memory.forget replays the reply it saved when a backup set was published after it', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const client = buildTestClient(ctx.url, laptop.token);

  const item = await ctx.memory.remember({
    text: 'Keeps a spare key under the blue pot',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const input = { clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85', ...item };

  const first = await client.memory.forget(input);

  await seedPublishedBackupSet(ctx.writer, { sequence: 1, logHead: 1_000_000 });

  const replay = await client.memory.forget(input);

  expect(first).toStrictEqual({
    itemID: item.itemID,
    pending: false,
    backup: { state: 'pending' },
  });

  expect(replay).toStrictEqual(first);
});

test('#memory.forgetRetired replays the reply it saved when a backup set was published after it', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const client = buildTestClient(ctx.url, laptop.token);

  const provenance = {
    origin: 'owner',
    source: 'owner',
    taskID: null,
    proposalID: null,
    checks: null,
  } as const;

  const item = await ctx.memory.remember({ text: 'Owns a red canoe', provenance });
  const retired = await ctx.memory.retire({ target: item, provenance });

  const input = { clientActionID: '0b7d4e2a-9c61-4f38-8a5d-3e1f6c9b2a74', targets: [retired] };

  const first = await client.memory.forgetRetired(input);

  await seedPublishedBackupSet(ctx.writer, { sequence: 1, logHead: 1_000_000 });

  const replay = await client.memory.forgetRetired(input);

  expect(first).toStrictEqual({
    deleted: [item.itemID],
    pending: [],
    backup: { state: 'pending' },
  });

  expect(replay).toStrictEqual(first);
});

test('#memory.forgetRetired starts no erasure when its client action ID belongs to another change', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const client = buildTestClient(ctx.url, laptop.token);

  const provenance = {
    origin: 'owner',
    source: 'owner',
    taskID: null,
    proposalID: null,
    checks: null,
  } as const;

  const items = await Promise.all(
    ['Plays the cello on Thursdays', 'Grows chillies on the balcony'].map((text) =>
      ctx.memory.remember({ text, provenance }),
    ),
  );

  const other = await ctx.memory.remember({ text: 'Owns a red canoe', provenance });

  const retired = await Promise.all(
    items.map((target) => ctx.memory.retire({ target, provenance })),
  );

  await client.memory.retire({
    clientActionID: '0b7d4e2a-9c61-4f38-8a5d-3e1f6c9b2a74',
    ...other,
  });

  const forget = client.memory.forgetRetired({
    clientActionID: '0b7d4e2a-9c61-4f38-8a5d-3e1f6c9b2a74',
    targets: retired,
  });

  await forget.catch(() => {});

  const states = await Promise.all(items.map((item) => ctx.memory.readHistory(item.itemID)));

  expect(forget).rejects.toMatchObject({ code: 'CLIENT_ACTION_ID_REUSED' });
  expect(states.map((history) => history?.state)).toStrictEqual(['retired', 'retired']);
});

test('#memory.forget refuses a caller with no session', async () => {
  const ctx = await setupTest();

  const forget = buildTestClient(ctx.url).memory.forget({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    itemID: 'item-a',
    version: 1,
  });

  await forget.catch(() => {});

  expect(forget).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('#memory.previewForgetRetired lists each retired item at its version with what its forget destroys', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const client = buildTestClient(ctx.url, laptop.token);

  const item = await ctx.memory.remember({
    text: 'Plays the cello on Thursdays',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.remember({
    text: 'Grows chillies on the balcony',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.retire({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const preview = await client.memory.previewForgetRetired();

  expect(preview).toStrictEqual({
    hasMore: false,
    items: [
      {
        changedAt: expect.toBeValidDate(),
        createdAt: expect.toBeValidDate(),
        forgottenAt: null,
        isBridge: false,
        isPinned: false,
        itemID: item.itemID,
        kind: 'fact',
        lost: { evidenceMessages: 0, proposals: 0 },
        origin: 'owner',
        shortID: expect.any(String),
        source: 'owner',
        state: 'retired',
        status: 'readable',
        subject: 'owner',
        text: 'Plays the cello on Thursdays',
        until: null,
        version: 2,
      },
    ],
  });
});

test('#memory.previewForgetRetired refuses a caller with no session', async () => {
  const ctx = await setupTest();

  const preview = buildTestClient(ctx.url).memory.previewForgetRetired();

  await preview.catch(() => {});

  expect(preview).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('#memory.forgetRetired deletes the confirmed set, with a forgotten record for each item', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const client = buildTestClient(ctx.url, laptop.token);

  const items = await Promise.all(
    ['Plays the cello on Thursdays', 'Grows chillies on the balcony'].map((text) =>
      ctx.memory.remember({
        text,
        provenance: {
          origin: 'owner',
          source: 'owner',
          taskID: null,
          proposalID: null,
          checks: null,
        },
      }),
    ),
  );

  await Promise.all(
    items.map((target) =>
      ctx.memory.retire({
        target,
        provenance: {
          origin: 'owner',
          source: 'owner',
          taskID: null,
          proposalID: null,
          checks: null,
        },
      }),
    ),
  );

  const preview = await client.memory.previewForgetRetired();

  const status = await client.memory.forgetRetired({
    clientActionID: '0b7d4e2a-9c61-4f38-8a5d-3e1f6c9b2a74',
    targets: preview.items.map((item) => ({ itemID: item.itemID, version: item.version })),
  });

  const records = await readRecords(ctx.context.log, { afterSequence: 0 });

  expect(status).toStrictEqual({
    deleted: preview.items.map((item) => item.itemID),
    pending: [],
    backup: { state: 'pending' },
  });

  expect(
    records
      .filter((entry) => entry.record.kind === 'erasure.finished')
      .map((entry) => entry.record.payload['targetID']),
  ).toIncludeSameMembers(items.map((item) => item.itemID));
});

test('#memory.forgetRetired refuses a confirmation made stale by a restore after the preview, and deletes nothing', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const client = buildTestClient(ctx.url, laptop.token);

  const items = await Promise.all(
    ['Plays the cello on Thursdays', 'Grows chillies on the balcony'].map((text) =>
      ctx.memory.remember({
        text,
        provenance: {
          origin: 'owner',
          source: 'owner',
          taskID: null,
          proposalID: null,
          checks: null,
        },
      }),
    ),
  );

  const retired = await Promise.all(
    items.map((target) =>
      ctx.memory.retire({
        target,
        provenance: {
          origin: 'owner',
          source: 'owner',
          taskID: null,
          proposalID: null,
          checks: null,
        },
      }),
    ),
  );

  const preview = await client.memory.previewForgetRetired();

  const [, restored] = retired;

  invariant(restored);

  await client.memory.restore({
    clientActionID: '7a3e9c1d-2b58-4f06-9d4a-c81e5f7b3d29',
    ...restored,
  });

  const before = await readRecords(ctx.context.log, { afterSequence: 0 });

  const forget = client.memory.forgetRetired({
    clientActionID: '0b7d4e2a-9c61-4f38-8a5d-3e1f6c9b2a74',
    targets: preview.items.map((item) => ({ itemID: item.itemID, version: item.version })),
  });

  await forget.catch(() => {});

  const after = await readRecords(ctx.context.log, { afterSequence: 0 });
  const left = await client.memory.previewForgetRetired();

  expect(forget).rejects.toMatchObject({ code: 'STALE_VERSION' });
  expect(after).toStrictEqual(before);
  expect(left.items).toMatchObject([{ itemID: items[0]?.itemID, status: 'readable' }]);
  expect(ctx.cleanupSessions).not.toHaveBeenCalled();
});

test('#memory.forgetRetired leaves alone an item retired after the preview', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const client = buildTestClient(ctx.url, laptop.token);

  const first = await ctx.memory.remember({
    text: 'Plays the cello on Thursdays',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const second = await ctx.memory.remember({
    text: 'Grows chillies on the balcony',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.retire({
    target: first,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const preview = await client.memory.previewForgetRetired();

  await client.memory.retire({ clientActionID: '7a3e9c1d-2b58-4f06-9d4a-c81e5f7b3d29', ...second });

  const status = await client.memory.forgetRetired({
    clientActionID: '0b7d4e2a-9c61-4f38-8a5d-3e1f6c9b2a74',
    targets: preview.items.map((item) => ({ itemID: item.itemID, version: item.version })),
  });

  const left = await client.memory.previewForgetRetired();

  expect(status).toStrictEqual({
    deleted: [first.itemID],
    pending: [],
    backup: { state: 'pending' },
  });

  expect(left.items).toMatchObject([
    { itemID: second.itemID, status: 'readable', text: 'Grows chillies on the balcony' },
  ]);
});

test('#memory.forgetRetired refuses a target listed twice', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const forget = buildTestClient(ctx.url, laptop.token).memory.forgetRetired({
    clientActionID: '0b7d4e2a-9c61-4f38-8a5d-3e1f6c9b2a74',
    targets: [
      { itemID: 'item-a', version: 2 },
      { itemID: 'item-a', version: 2 },
    ],
  });

  await forget.catch(() => {});

  expect(forget).rejects.toMatchObject({ code: 'BAD_REQUEST' });
});

test('#memory.forgetRetired replies with the pending items when a cleanup failed, and finishes them on the retry', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const client = buildTestClient(ctx.url, laptop.token);

  const items = await Promise.all(
    ['Plays the cello on Thursdays', 'Grows chillies on the balcony'].map((text) =>
      ctx.memory.remember({
        text,
        provenance: {
          origin: 'owner',
          source: 'owner',
          taskID: null,
          proposalID: null,
          checks: null,
        },
      }),
    ),
  );

  const retired = await Promise.all(
    items.map((target) =>
      ctx.memory.retire({
        target,
        provenance: {
          origin: 'owner',
          source: 'owner',
          taskID: null,
          proposalID: null,
          checks: null,
        },
      }),
    ),
  );

  ctx.cleanupSessions.mockImplementationOnce(() =>
    Promise.reject(new Error('the guest did not answer')),
  );

  const input = { clientActionID: '0b7d4e2a-9c61-4f38-8a5d-3e1f6c9b2a74', targets: retired };
  const itemIDs = retired.map((target) => target.itemID);

  const failed = await client.memory.forgetRetired(input);
  const pending = await client.memory.readForgetStatus({ itemIDs });
  const retried = await client.memory.forgetRetired(input);

  expect(failed).toStrictEqual({ deleted: [], pending: itemIDs, backup: { state: 'pending' } });
  expect(pending).toStrictEqual({ deleted: [], pending: itemIDs, backup: { state: 'pending' } });

  expect(retried).toStrictEqual({
    deleted: itemIDs,
    pending: [],
    backup: { state: 'pending' },
  });
});

test('#memory.forgetRetired refuses a caller with no session, and deletes and records nothing', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.remember({
    text: 'Plays the cello on Thursdays',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const retired = await ctx.memory.retire({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const forget = buildTestClient(ctx.url).memory.forgetRetired({
    clientActionID: '0b7d4e2a-9c61-4f38-8a5d-3e1f6c9b2a74',
    targets: [retired],
  });

  await forget.catch(() => {});

  const history = await ctx.memory.readHistory(item.itemID);

  const actions = await ctx.context.log.writer.db
    .$extendTables<APITables>()
    .selectFrom('client_actions')
    .select('procedure')
    .execute();

  expect(forget).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  expect(history?.state).toBe('retired');
  expect(actions).toStrictEqual([]);
  expect(ctx.cleanupSessions).not.toHaveBeenCalled();
});

test('#memory.readForgetStatus reports the key backups of an item no forget took as pending', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const item = await ctx.memory.remember({
    text: 'Plays the cello on Thursdays',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const status = await buildTestClient(ctx.url, laptop.token).memory.readForgetStatus({
    itemIDs: [item.itemID],
  });

  expect(status).toStrictEqual({ deleted: [], pending: [], backup: { state: 'pending' } });
});

test('#memory.readForgetStatus refuses a caller with no session', async () => {
  const ctx = await setupTest();

  const status = buildTestClient(ctx.url).memory.readForgetStatus({ itemIDs: ['item-a'] });

  await status.catch(() => {});

  expect(status).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});
