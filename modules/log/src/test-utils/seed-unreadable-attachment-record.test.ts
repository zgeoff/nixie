import { expect, test } from 'bun:test';
import { readRecordAttachments } from '../read-record-attachments';
import { seedRecord } from './seed-record';
import { seedUnreadableAttachmentRecord } from './seed-unreadable-attachment-record';
import { startTestLog } from './start-test-log';

test('it leaves an owner message whose attachment cannot be decrypted', async () => {
  const ctx = await startTestLog();
  const record = await seedUnreadableAttachmentRecord(ctx, { kind: 'owner_message' });
  const attachments = await readRecordAttachments(ctx.log, [record.sequence]);

  expect(record.kind).toBe('owner_message');
  expect(attachments.get(record.sequence)).toStrictEqual({ status: 'unreadable' });
});

test('it leaves the attachment of another record readable', async () => {
  const ctx = await startTestLog();

  const readable = await seedRecord(ctx, {
    kind: 'owner_message',
    thread: 'conversation',
    contentSource: 'owner',
    payload: { images: [{ mediaType: 'image/png' }] },
    erasable: { text: 'one harbour photo', spans: [] },
    attachments: [new TextEncoder().encode('harbour-photo')],
  });

  const unreadable = await seedUnreadableAttachmentRecord(ctx, { kind: 'owner_message' });

  const attachments = await readRecordAttachments(ctx.log, [
    readable.sequence,
    unreadable.sequence,
  ]);

  const readableAttachments = attachments.get(readable.sequence);

  expect(readableAttachments?.status).toBe('readable');

  if (readableAttachments?.status !== 'readable') {
    throw new Error('expected the other record attachment to be readable');
  }

  expect(
    readableAttachments.attachments.map((bytes) => new TextDecoder().decode(bytes)),
  ).toStrictEqual(['harbour-photo']);

  expect(attachments.get(unreadable.sequence)).toStrictEqual({ status: 'unreadable' });
});

test('it seeds a second unreadable record after a first', async () => {
  const ctx = await startTestLog();
  const first = await seedUnreadableAttachmentRecord(ctx, { kind: 'owner_message' });
  const second = await seedUnreadableAttachmentRecord(ctx, { kind: 'owner_message' });
  const attachments = await readRecordAttachments(ctx.log, [first.sequence, second.sequence]);

  expect(attachments.get(first.sequence)).toStrictEqual({ status: 'unreadable' });
  expect(attachments.get(second.sequence)).toStrictEqual({ status: 'unreadable' });
});
