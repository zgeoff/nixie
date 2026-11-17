import { expect, onTestFinished, test } from 'bun:test';
import {
  defaultGateLimits,
  defaultOwnerPronouns,
  memoryExportSchema,
  startMemoryStore,
} from '@heynixie/memory';
import { seedSharedKeyVersion } from '@heynixie/memory/test-utils';
import { createConversationTask } from '@heynixie/tasks';
import { buildTestClient } from '../test-utils/build-test-client';
import { createDeviceSession } from '../test-utils/create-device-session';
import { startTestAPI } from '../test-utils/start-test-api';
import type { APITables } from '../types';

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
      limits: defaultGateLimits,
      ownerName: null,
      ownerPronouns: defaultOwnerPronouns,
      getPromptsInForce: () => ({ snapshotHash: 'sha256:test', prompts: {} }),
    },
  });

  onTestFinished(() => memory.stop());

  api.setMemory(memory);

  api.setSessionCleanup((cause) =>
    memory.finishEvidencePurges({ recordSequence: cause.recordSequence }),
  );

  return { ...api, memory };
}

test('#memory.export marks the bridge version of an item purged by a forget of its quoted message, and the versions it removed as removed', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const client = buildTestClient(ctx.url, laptop.token);

  const sent = await client.conversation.send({
    clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    thread: 'conversation',
    text: 'I keep bees on the allotment.',
    spans: [],
  });

  const first = await seedSharedKeyVersion(ctx.context.log, {
    text: 'Keeps bees on the allotment',
    evidence: { recordSequence: sent.sequence, start: 0, end: 11 },
    evidenceQuote: 'I keep bees',
  });

  await seedSharedKeyVersion(ctx.context.log, {
    target: first,
    text: 'Keeps two hives on the allotment',
  });

  await client.conversation.forget({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    thread: 'conversation',
    sequence: sent.sequence,
  });

  const stream = await client.memory.export({
    clientActionID: '9d4e2b71-3c8a-4f5e-b6d0-1a7c9e3f5b24',
  });

  const events = await Array.fromAsync(stream);

  const parsed = memoryExportSchema.safeParse(
    JSON.parse(events.flatMap((event) => ('chunk' in event ? [event.chunk] : [])).join('')),
  );

  expect(parsed.data?.items).toMatchObject([
    {
      itemID: first.itemID,
      versions: [
        { version: 1, text: null, evidenceQuote: null, isRemoved: true, isBridge: false },
        { version: 2, text: null, evidenceQuote: null, isRemoved: true, isBridge: false },
        {
          version: 3,
          text: 'Keeps two hives on the allotment',
          evidenceQuote: null,
          isRemoved: false,
          isBridge: true,
        },
      ],
    },
  ]);
});

test('#memory.export streams one export file of every item, which the schema accepts', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const active = await ctx.memory.remember({
    text: 'Rents allotment plot 14',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const forgotten = await ctx.memory.remember({
    text: 'Keeps a spare key under the blue pot',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.forget({
    target: forgotten,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const stream = await buildTestClient(ctx.url, laptop.token).memory.export({
    clientActionID: '9d4e2b71-3c8a-4f5e-b6d0-1a7c9e3f5b24',
  });

  const events = await Array.fromAsync(stream);

  const parsed = memoryExportSchema.safeParse(
    JSON.parse(events.flatMap((event) => ('chunk' in event ? [event.chunk] : [])).join('')),
  );

  expect(parsed.data).toMatchObject({
    header: {
      schemaVersion: 11,
      exportedAt: '1970-01-01T00:16:40.000Z',
      snapshotHash: 'sha256:test',
    },
    items: [
      {
        itemID: active.itemID,
        shortID: expect.toBeString(),
        state: 'active',
        isPinned: false,
        subject: 'owner',
        versions: [
          { version: 1, text: 'Rents allotment plot 14', isRemoved: false, isBridge: false },
        ],
      },
      { itemID: forgotten.itemID, forgottenAt: expect.toBeDateString() },
    ],
  });
});

test('#memory.export ends the stream with the event that marks the file complete', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const stream = await buildTestClient(ctx.url, laptop.token).memory.export({
    clientActionID: '9d4e2b71-3c8a-4f5e-b6d0-1a7c9e3f5b24',
  });

  const events = await Array.fromAsync(stream);

  expect(events.at(-1)).toStrictEqual({ isComplete: true });
  expect(events.slice(0, -1)).toSatisfyAll((event: object) => 'chunk' in event);
});

test('#memory.export records the export as a checked action with its time, schema version and snapshot hash', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const stream = await buildTestClient(ctx.url, laptop.token).memory.export({
    clientActionID: '9d4e2b71-3c8a-4f5e-b6d0-1a7c9e3f5b24',
  });

  await Array.fromAsync(stream);

  const actions = await ctx.writer.db
    .$extendTables<APITables>()
    .selectFrom('client_actions')
    .select(['client_action_id', 'procedure', 'identity_id', 'result'])
    .where('procedure', 'like', 'memory.%')
    .execute();

  expect(actions).toStrictEqual([
    {
      client_action_id: '9d4e2b71-3c8a-4f5e-b6d0-1a7c9e3f5b24',
      procedure: 'memory.export',
      identity_id: laptop.caller.identityID,
      result: JSON.stringify({
        exportedAt: 1_000_000,
        schemaVersion: 11,
        snapshotHash: 'sha256:test',
      }),
    },
  ]);
});

test('#memory.export streams the file again for a retry with the same client action ID', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const client = buildTestClient(ctx.url, laptop.token);

  const first = await client.memory.export({
    clientActionID: '9d4e2b71-3c8a-4f5e-b6d0-1a7c9e3f5b24',
  });

  await Array.fromAsync(first);

  const retry = await client.memory.export({
    clientActionID: '9d4e2b71-3c8a-4f5e-b6d0-1a7c9e3f5b24',
  });

  const retried = await Array.fromAsync(retry);

  expect(
    JSON.parse(retried.flatMap((event) => ('chunk' in event ? [event.chunk] : [])).join('')),
  ).toStrictEqual({
    header: {
      schemaVersion: 11,
      exportedAt: '1970-01-01T00:16:40.000Z',
      snapshotHash: 'sha256:test',
    },
    items: [],
    moments: [],
  });
});

test('#memory.export refuses a client action ID that another action used', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const client = buildTestClient(ctx.url, laptop.token);

  const item = await ctx.memory.remember({
    text: 'Rents allotment plot 14',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await client.memory.retire({
    clientActionID: '9d4e2b71-3c8a-4f5e-b6d0-1a7c9e3f5b24',
    itemID: item.itemID,
    version: 1,
  });

  const exported = client.memory.export({ clientActionID: '9d4e2b71-3c8a-4f5e-b6d0-1a7c9e3f5b24' });

  await exported.catch(() => {});

  expect(exported).rejects.toMatchObject({ code: 'CLIENT_ACTION_ID_REUSED' });
});

test('#memory.export refuses a caller with no session', async () => {
  const ctx = await setupTest();

  const exported = buildTestClient(ctx.url).memory.export({
    clientActionID: '9d4e2b71-3c8a-4f5e-b6d0-1a7c9e3f5b24',
  });

  await exported.catch(() => {});

  expect(exported).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('#memory.export refuses an export before the memory store starts', async () => {
  const api = await startTestAPI();
  const laptop = await createDeviceSession(api.context, 'laptop');

  const exported = buildTestClient(api.url, laptop.token).memory.export({
    clientActionID: '9d4e2b71-3c8a-4f5e-b6d0-1a7c9e3f5b24',
  });

  await exported.catch(() => {});

  expect(exported).rejects.toMatchObject({ code: 'MEMORY_NOT_STARTED' });
});
