import { expect, test } from 'bun:test';
import { readRecords, withWriteTransaction } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { buildMockWriteCaller } from '../test-utils/build-mock-write-caller';
import { startTestMemory } from '../test-utils/start-test-memory';
import { readMergedStakes } from './read-merged-stakes';

async function setupTest() {
  const memory = await startTestMemory();

  const text = 'Keeps a rowing boat at the lake';

  return {
    memory,
    open: () =>
      memory.store.writes.remember({
        text,
        caller: buildMockWriteCaller({ thread: 'conversation' }),
      }),
    mergeFrom: (thread: string) =>
      memory.store.writes.remember({
        text,
        caller: buildMockWriteCaller({ origin: 'task', thread, taskID: thread }),
      }),
    readStakes: (proposalID: string) =>
      withWriteTransaction(memory.writer, (tx) => readMergedStakes(tx, proposalID)),
    readMergeSequences: async () => {
      const merges = await readRecords(memory.log, {
        afterSequence: 0,
        kinds: ['memory.proposal_merged'],
      });

      return merges.map((entry) => entry.record.sequence);
    },
  };
}

test('it names each merged thread once, at the sequence of its first merge', async () => {
  const ctx = await setupTest();
  const opened = await ctx.open();

  await ctx.mergeFrom('task-1');
  await ctx.mergeFrom('task-2');
  await ctx.mergeFrom('task-1');

  invariant(opened.status === 'proposed', 'the first write opened a proposal');

  const stakes = await ctx.readStakes(opened.proposalID);
  const sequences = await ctx.readMergeSequences();

  expect(stakes.map((stake) => stake.thread)).toStrictEqual(['task-1', 'task-2']);
  expect(stakes.map((stake) => stake.sequence)).toStrictEqual(sequences.slice(0, 2));
});
