import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { readRecordForgetProgress } from '../record/read-record-forget-progress';
import { runRecordForget } from '../record/run-record-forget';
import { seedPublishedBackupSet } from '../test-utils/seed-published-backup-set';
import { seedQuotedMemoryItems } from '../test-utils/seed-quoted-memory-items';
import { startTestAPI } from '../test-utils/start-test-api';
import { startTestMemoryForgets } from '../test-utils/start-test-memory-forgets';
import { readForgetBackupState } from './read-forget-backup-state';

async function setupTest() {
  const api = await startTestAPI();
  const forgets = await startTestMemoryForgets(api.context);
  const seeded = await seedQuotedMemoryItems(api.context, forgets.memory);

  return {
    ...api,
    ...forgets,
    seeded,
    readForgottenSequence: async () => {
      const [entry] = await readRecords(api.context.log, {
        afterSequence: 0,
        kinds: ['record.forgotten'],
      });

      invariant(entry, 'the forget wrote no record.forgotten');

      return entry.record.sequence;
    },
    readBackupState: async () => {
      const progress = await readRecordForgetProgress(api.context, seeded.sequence);

      return readForgetBackupState(api.context, progress);
    },
  };
}

test('it reads the backup as pending while the purge of an item has not finished', async () => {
  const ctx = await setupTest();

  await runRecordForget(ctx.context, { thread: 'conversation', sequence: ctx.seeded.sequence });

  const state = await ctx.readBackupState();

  expect(state).toStrictEqual({ state: 'pending' });
});

test('it reads the backup as pending until a published set copied at record.forgotten, which follows every purge', async () => {
  const ctx = await setupTest();

  await runRecordForget(ctx.forgetContext, {
    thread: 'conversation',
    sequence: ctx.seeded.sequence,
  });

  const forgotten = await ctx.readForgottenSequence();

  await seedPublishedBackupSet(ctx.writer, { sequence: 1, logHead: forgotten - 1 });

  const before = await ctx.readBackupState();

  await seedPublishedBackupSet(ctx.writer, { sequence: 2, logHead: forgotten });

  const after = await ctx.readBackupState();

  expect(before).toStrictEqual({ state: 'pending' });
  expect(after).toStrictEqual({ state: 'complete' });
});
