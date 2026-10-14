import { expect, onTestFinished, test } from 'bun:test';
import {
  defaultGateLimits,
  defaultOwnerPronouns,
  findNoAllowRule,
  startMemoryStore,
} from '@heynixie/memory';
import { buildTestClient } from './test-utils/build-test-client';
import { createDeviceSession } from './test-utils/create-device-session';
import { startTestAPI } from './test-utils/start-test-api';

function setupTest() {
  return startTestAPI();
}

test('#memory.readVersions reads the text of each named version, and a missing one as missing', async () => {
  const ctx = await setupTest();

  const laptop = await createDeviceSession(ctx.context, 'laptop');
  const memory = await startMemoryStore({
    log: ctx.context.log,
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
      clock: ctx.clock,
      findAllowRule: findNoAllowRule,
      limits: defaultGateLimits,
      ownerName: null,
      ownerPronouns: defaultOwnerPronouns,
    },
  });

  onTestFinished(() => memory.stop());

  const item = await memory.remember({
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
