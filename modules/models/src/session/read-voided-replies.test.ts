import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { startTestLog } from '@heynixie/log/test-utils';
import { modelReplyVoidedCodec } from './model-reply-voided-codec';
import { readVoidedReplies } from './read-voided-replies';

async function setupTest() {
  const testLog = await startTestLog();

  return { ...testLog };
}

test('it reads the reason of each reply that a void names', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    {
      kind: modelReplyVoidedCodec.kind,
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: modelReplyVoidedCodec.encode({
        replySequence: 7,
        runID: 'run-1',
        reason: 'attempt_failed',
      }),
    },
    {
      kind: modelReplyVoidedCodec.kind,
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: modelReplyVoidedCodec.encode({
        replySequence: 9,
        runID: 'run-2',
        reason: 'silent',
      }),
    },
  ]);

  const voided = await readVoidedReplies(ctx.writer.db, [6, 7, 8]);

  expect([...voided]).toStrictEqual([[7, 'attempt_failed']]);
});

test('it reads no reply from an empty list', async () => {
  const ctx = await setupTest();
  const voided = await readVoidedReplies(ctx.writer.db, []);

  expect([...voided]).toStrictEqual([]);
});
