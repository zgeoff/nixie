import type { SealedAttachment } from './decode-attachment';
import { decodeAttachment } from './decode-attachment';
import { readRecordKeys } from './read-record-keys';
import type { Log, LogTables, RecordAttachments } from './types';

// Reads and decrypts the attachments of each record named, in the order written, keyed by the
// record's sequence. A record with none reads as none, and one whose key a forget deleted reads as
// shredded. A key that fails to unwrap, or a ciphertext that fails to decrypt, reads as unreadable.
export async function readRecordAttachments(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  sequences: readonly number[],
): Promise<ReadonlyMap<number, RecordAttachments>> {
  if (sequences.length === 0) {
    return new Map();
  }

  const db = log.writer.db.$extendTables<LogTables>();

  const rows = await db
    .selectFrom('record_attachments')
    .innerJoin('records', 'records.sequence', 'record_attachments.sequence')
    .select([
      'record_attachments.sequence',
      'record_attachments.position',
      'record_attachments.sealed',
      'records.key_id',
    ])
    .where('record_attachments.sequence', 'in', sequences)
    .orderBy('record_attachments.sequence')
    .orderBy('record_attachments.position')
    .execute();

  const keys = await readRecordKeys(log, [
    ...new Set(rows.flatMap((row) => (row.key_id === null ? [] : [row.key_id]))),
  ]);

  const entries = await Promise.all(
    sequences.map(async (sequence) => {
      const sealed = rows.filter((row) => row.sequence === sequence);

      return [sequence, await decodeRecordAttachments(sealed, keys)] as const;
    }),
  );

  return new Map(entries);
}

interface StoredAttachment extends SealedAttachment {
  readonly key_id: string | null;
}

function decodeRecordAttachments(
  sealed: readonly StoredAttachment[],
  keys: ReadonlyMap<string, CryptoKey | null>,
): Promise<RecordAttachments> {
  const keyID = sealed[0]?.key_id;

  if (keyID === undefined || keyID === null) {
    return Promise.resolve({ status: 'none' });
  }

  const key = keys.get(keyID);

  if (key === undefined) {
    return Promise.resolve({ status: 'shredded' });
  }

  if (key === null) {
    return Promise.resolve({ status: 'unreadable' });
  }

  return Promise.all(sealed.map((attachment) => decodeAttachment(key, keyID, attachment))).then(
    (attachments): RecordAttachments => ({ status: 'readable', attachments }),
    (): RecordAttachments => ({ status: 'unreadable' }),
  );
}
