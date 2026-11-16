import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { defaultGateLimits } from '../gate/default-gate-limits';
import { startStoreIndexes } from '../moment/store/start-store-indexes';
import { defaultOwnerPronouns } from '../owner/default-owner-pronouns';
import { buildMockProvenance } from '../test-utils/build-mock-provenance';
import { startTestMemory } from '../test-utils/start-test-memory';
import type { MemoryContext, StoreParts } from '../types';
import { makeDeliveryLock } from '../utils/make-delivery-lock';
import { placeTurnMemory } from './place-turn-memory';

async function setupTest() {
  const memory = await startTestMemory();

  const context: MemoryContext = {
    log: memory.log,
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
      clock: { now: () => Date.now() },
      defaultZone: 'UTC',
      limits: defaultGateLimits,
      ownerName: null,
      ownerPronouns: defaultOwnerPronouns,
      getPromptsInForce: () => ({ snapshotHash: 'sha256:test', prompts: {} }),
    },
  };

  const indexes = await startStoreIndexes(context);

  memory.defer(async () => {
    await Promise.all([indexes.index.stop(), indexes.triggers.stop()]);
  });

  const parts: StoreParts = { context, ...indexes, lock: makeDeliveryLock() };

  return { memory, parts };
}

test('it drops a pick that was retired after the selection and records nothing', async () => {
  const ctx = await setupTest();

  const piano = await ctx.memory.store.remember({
    text: 'Piano is tuned in spring',
    provenance: buildMockProvenance(),
    labels: { gist: 'Piano tuning', topic: 'general', triggers: ['piano tuning'] },
  });

  const pick = { itemID: piano.itemID, version: piano.version, isSelf: false };

  await ctx.memory.store.retire({ target: piano, provenance: buildMockProvenance() });

  const result = await placeTurnMemory(ctx.parts, 'conversation', {
    kind: 'selected',
    picks: [pick],
    searchModes: ['keyword'],
  });

  const records = await readRecords(ctx.memory.log, {
    afterSequence: 0,
    kinds: ['memory.recalled'],
  });

  expect({ result, records }).toStrictEqual({ result: { kind: 'none' }, records: [] });
});
