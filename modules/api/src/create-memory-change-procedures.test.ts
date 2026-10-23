import { expect, onTestFinished, test } from 'bun:test';
import type { PinnedCoreView } from '@heynixie/memory';
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
      getPromptsInForce: () => ({ snapshotHash: 'sha256:test', prompts: {} }),
    },
  });

  onTestFinished(() => memory.stop());

  api.setMemory(memory);

  return { ...api, memory };
}

test('#memory.retire retires the item at the version the view showed, as your own change', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const item = await ctx.memory.remember({
    text: 'Rents a flat on Mill Lane',
    provenance: {
      origin: 'memory_writer',
      source: 'owner',
      taskID: 'memory-writer',
      proposalID: null,
      checks: null,
    },
  });

  const retired = await buildTestClient(ctx.url, laptop.token).memory.retire({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    itemID: item.itemID,
    version: 1,
  });

  const history = await ctx.memory.readHistory(item.itemID);

  expect(retired).toStrictEqual({ itemID: item.itemID, version: 2 });

  expect(history).toMatchObject({
    state: 'retired',
    versions: [{ origin: 'memory_writer' }, { change: 'retired', origin: 'owner' }],
  });
});

test('#memory.retire answers a retry with its first result and retires once', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const client = buildTestClient(ctx.url, laptop.token);

  const item = await ctx.memory.remember({
    text: 'Rents a flat on Mill Lane',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await client.memory.retire({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    itemID: item.itemID,
    version: 1,
  });

  const retried = await client.memory.retire({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    itemID: item.itemID,
    version: 1,
  });

  const history = await ctx.memory.readHistory(item.itemID);

  expect(retried).toStrictEqual({ itemID: item.itemID, version: 2 });
  expect(history?.versions).toHaveLength(2);
});

test('#memory.retire refuses a version the item moved past, and retires nothing', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const item = await ctx.memory.remember({
    text: 'Rents a flat on Mill Lane',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.remember({
    text: 'Rents a flat on Quay Street',
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const retire = buildTestClient(ctx.url, laptop.token).memory.retire({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    itemID: item.itemID,
    version: 1,
  });

  await retire.catch(() => {});

  const history = await ctx.memory.readHistory(item.itemID);

  expect(retire).rejects.toMatchObject({ code: 'STALE_VERSION' });
  expect(history?.state).toBe('active');
});

test('#memory.retire refuses an item that does not exist', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const retire = buildTestClient(ctx.url, laptop.token).memory.retire({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    itemID: 'no-such-item',
    version: 1,
  });

  await retire.catch(() => {});

  expect(retire).rejects.toMatchObject({ code: 'MEMORY_ITEM_NOT_FOUND' });
});

test('#memory.retire refuses a client action ID that another change used', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const client = buildTestClient(ctx.url, laptop.token);

  const first = await ctx.memory.remember({
    text: 'Rents a flat on Mill Lane',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const second = await ctx.memory.remember({
    text: 'Waters the ferns on Sundays',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await client.memory.retire({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    itemID: first.itemID,
    version: 1,
  });

  const retire = client.memory.retire({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    itemID: second.itemID,
    version: 1,
  });

  await retire.catch(() => {});

  expect(retire).rejects.toMatchObject({ code: 'CLIENT_ACTION_ID_REUSED' });
});

test('#memory.retire refuses a caller with no session', async () => {
  const ctx = await setupTest();

  const retire = buildTestClient(ctx.url).memory.retire({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    itemID: 'item-a',
    version: 1,
  });

  await retire.catch(() => {});

  expect(retire).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('#memory.restore makes a retired item active again', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const item = await ctx.memory.remember({
    text: 'Rents a flat on Mill Lane',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const retired = await ctx.memory.retire({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const restored = await buildTestClient(ctx.url, laptop.token).memory.restore({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    itemID: retired.itemID,
    version: retired.version,
  });

  const history = await ctx.memory.readHistory(item.itemID);

  expect(restored).toStrictEqual({ itemID: item.itemID, version: 3 });
  expect(history?.state).toBe('active');
});

test('#memory.restore refuses an item that is still active', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const item = await ctx.memory.remember({
    text: 'Rents a flat on Mill Lane',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const restore = buildTestClient(ctx.url, laptop.token).memory.restore({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    itemID: item.itemID,
    version: 1,
  });

  await restore.catch(() => {});

  expect(restore).rejects.toMatchObject({ code: 'WRONG_STATE' });
});

test('#memory.pin pins an item at the version the view showed', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const item = await ctx.memory.remember({
    text: 'Is allergic to peanuts',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const pinned = await buildTestClient(ctx.url, laptop.token).memory.pin({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    itemID: item.itemID,
    version: 1,
    isPinned: true,
  });

  const core = await ctx.memory.view.readPinnedCore();

  expect(pinned).toStrictEqual({ itemID: item.itemID, isPinned: true });
  expect(core.items.map((pin) => pin.itemID)).toStrictEqual([item.itemID]);
});

test('#memory.pin unpins an item', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const item = await ctx.memory.remember({
    text: 'Is allergic to peanuts',
    isPinned: true,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await buildTestClient(ctx.url, laptop.token).memory.pin({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    itemID: item.itemID,
    version: 1,
    isPinned: false,
  });

  const core = await ctx.memory.view.readPinnedCore();

  expect(core.items).toStrictEqual([]);
});

test('#memory.pin refuses a version the item moved past', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const item = await ctx.memory.remember({
    text: 'Is allergic to peanuts',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.remember({
    text: 'Is allergic to peanuts and sesame',
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const pin = buildTestClient(ctx.url, laptop.token).memory.pin({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    itemID: item.itemID,
    version: 1,
    isPinned: true,
  });

  await pin.catch(() => {});

  expect(pin).rejects.toMatchObject({ code: 'STALE_VERSION' });
});

test('#memory.pin refuses a pin that takes the pinned core past its budget', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const item = await ctx.memory.remember({
    text: Array.from({ length: 1200 }, (_, index) => `word${index}`).join(' '),
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const pin = buildTestClient(ctx.url, laptop.token).memory.pin({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    itemID: item.itemID,
    version: 1,
    isPinned: true,
  });

  await pin.catch(() => {});

  expect(pin).rejects.toMatchObject({ code: 'PINNED_CORE_FULL' });
});

test('#memory.pin pins a self-note', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const item = await ctx.memory.remember({
    text: 'Enjoys a slow morning question more than a quick one',
    subject: 'self',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await buildTestClient(ctx.url, laptop.token).memory.pin({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    itemID: item.itemID,
    version: 1,
    isPinned: true,
  });

  const core = await ctx.memory.readPinnedCore();

  expect(core).toMatchObject([{ itemID: item.itemID, subject: 'self' }]);
});

test('#memory.pin answers a retry with its first result after the pinned core filled', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const client = buildTestClient(ctx.url, laptop.token);

  // Each text is about 1,100 tokens, so the pinned core's budget holds one of them and not both.
  const item = await ctx.memory.remember({
    text: 'Keeps a long packing list for trips. '.repeat(119),
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await client.memory.pin({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    itemID: item.itemID,
    version: 1,
    isPinned: true,
  });

  await ctx.memory.pin({
    itemID: item.itemID,
    isPinned: false,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.remember({
    text: 'Keeps a long reading list for winter. '.repeat(116),
    isPinned: true,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const retried = await client.memory.pin({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    itemID: item.itemID,
    version: 1,
    isPinned: true,
  });

  expect(retried).toStrictEqual({ itemID: item.itemID, isPinned: true });

  expect(ctx.memory.view.readPinnedCore()).resolves.toSatisfy(
    (core: PinnedCoreView) => core.items.length === 1 && core.items[0]?.itemID !== item.itemID,
  );
});
