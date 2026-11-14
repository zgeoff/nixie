import { sql } from 'kysely';
import type { LogRecord, RecordInput } from '../types';
import { withWriteTransaction } from '../with-write-transaction';
import type { LogSeederDeps } from './log-seeder-deps';
import { seedRecord } from './seed-record';

export async function seedUnreadableAttachmentRecord(
  deps: LogSeederDeps,
  input: Pick<RecordInput, 'kind'> & Partial<RecordInput>,
): Promise<LogRecord> {
  const record = await seedRecord(deps, {
    thread: 'conversation',
    contentSource: 'owner',
    payload: { images: [{ mediaType: 'image/png' }] },
    erasable: { text: 'one shelf photo', spans: [] },
    attachments: [new TextEncoder().encode('shelf-photo')],
    ...input,
  });

  // An attachment whose bytes no longer decrypt: the table refuses an update, so the seed drops
  // that trigger first.
  await withWriteTransaction(deps.log.writer, async (tx) => {
    await sql`drop trigger record_attachments_refuse_update`.execute(tx);
    await sql`update record_attachments set sealed = randomblob(64)`.execute(tx);
  });

  return record;
}
