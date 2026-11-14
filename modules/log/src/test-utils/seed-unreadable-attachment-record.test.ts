import { expect, test } from 'bun:test';
import { readRecordAttachments } from '../read-record-attachments';
import { seedUnreadableAttachmentRecord } from './seed-unreadable-attachment-record';
import { startTestLog } from './start-test-log';

test('it leaves an owner message whose attachment cannot be decrypted', async () => {
  const ctx = await startTestLog();
  const record = await seedUnreadableAttachmentRecord(ctx, { kind: 'owner_message' });
  const attachments = await readRecordAttachments(ctx.log, [record.sequence]);

  expect(record.kind).toBe('owner_message');
  expect(attachments.get(record.sequence)).toStrictEqual({ status: 'unreadable' });
});
