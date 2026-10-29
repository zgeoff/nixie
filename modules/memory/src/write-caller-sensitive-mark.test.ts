import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { buildMockProvenance } from './test-utils/build-mock-provenance';
import { buildMockWriteCaller } from './test-utils/build-mock-write-caller';
import { startTestMemory } from './test-utils/start-test-memory';

test("it applies a caller's mark at once, in a record of the caller's thread", async () => {
  const memory = await startTestMemory();

  const item = await memory.store.remember({
    text: 'Lives at 14 Larkspur Lane, flat 3',
    provenance: buildMockProvenance(),
  });

  const outcome = await memory.store.writes.markSensitive({
    itemID: item.itemID,
    isSensitive: true,
    caller: buildMockWriteCaller({ thread: 'task-a', taskID: 'task-a', origin: 'task' }),
  });

  const [records, pending] = await Promise.all([
    readRecords(memory.log, { afterSequence: 0, kinds: ['memory.sensitive_marked'] }),
    memory.store.proposals.listPending(),
  ]);

  expect(outcome).toStrictEqual({ status: 'applied', itemID: item.itemID, version: 1 });

  expect(records.map((entry) => [entry.record.thread, entry.record.payload])).toStrictEqual([
    ['task-a', { itemID: item.itemID, isSensitive: true }],
  ]);

  expect(pending).toStrictEqual([]);
});
