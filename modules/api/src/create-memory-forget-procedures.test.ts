import { expect, mock, onTestFinished, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import type { CleanupSessions } from '@heynixie/memory';
import {
  defaultGateLimits,
  defaultOwnerPronouns,
  findNoAllowRule,
  startMemoryStore,
} from '@heynixie/memory';
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
      findAllowRule: findNoAllowRule,
      limits: defaultGateLimits,
      ownerName: null,
      ownerPronouns: defaultOwnerPronouns,
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

  expect(forgotten).toStrictEqual({ itemID: item.itemID });
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
  ).toStrictEqual(['memory.version_added', 'memory.forget_started', 'memory.forgotten']);
});

test('#memory.forget completes a forget on the retry after its session cleanup failed', async () => {
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

  const failed = await client.memory
    .forget({ clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85', ...item })
    .catch((error: unknown) => error);

  const retried = await client.memory.forget({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    ...item,
  });

  const history = await ctx.memory.readHistory(item.itemID);

  expect(failed).toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
  expect(retried).toStrictEqual({ itemID: item.itemID });
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
  ).toStrictEqual(['memory.version_added', 'memory.version_added']);
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
