import { expect, onTestFinished, test } from 'bun:test';
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

test('#memory.readVersions reads the text of each named version, and a missing one as missing', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const item = await ctx.memory.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const read = await buildTestClient(ctx.url, laptop.token).memory.readVersions({
    versions: [item, { itemID: item.itemID, version: 2 }],
  });

  expect(read).toStrictEqual({
    versions: [
      { itemID: item.itemID, version: 1, status: 'readable', text: 'Lives on Elm Street' },
      { itemID: item.itemID, version: 2, status: 'missing' },
    ],
  });
});

test('#memory.readVersions refuses a caller with no session', async () => {
  const ctx = await setupTest();

  const read = buildTestClient(ctx.url).memory.readVersions({
    versions: [{ itemID: 'item-a', version: 1 }],
  });

  await read.catch(() => {});

  expect(read).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('#memory.readRatingNotes reads the note of each named rating', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const item = await ctx.memory.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.recall({ itemIDs: [item.itemID], thread: 'conversation' });

  await ctx.memory.rate({
    thread: 'conversation',
    runID: 'run-1',
    ratedBy: null,
    ratings: [{ item: item.itemID, verdict: 'noise', note: 'the street never came up' }],
  });

  const page = await buildTestClient(ctx.url, laptop.token).conversation.read({
    thread: 'conversation',
  });

  const rated = page.records.find((record) => record.kind === 'memory.rated');

  invariant(rated);

  const read = await buildTestClient(ctx.url, laptop.token).memory.readRatingNotes({
    notes: [{ sequence: rated.sequence, itemID: item.itemID }],
  });

  expect(read.notes).toStrictEqual([
    {
      sequence: rated.sequence,
      itemID: item.itemID,
      status: 'readable',
      text: 'the street never came up',
    },
  ]);
});

test('#memory.readRatingNotes refuses a caller with no session', async () => {
  const ctx = await setupTest();

  const read = buildTestClient(ctx.url).memory.readRatingNotes({
    notes: [{ sequence: 1, itemID: 'item-a' }],
  });

  await read.catch(() => {});

  expect(read).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});
