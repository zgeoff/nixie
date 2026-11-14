import type { Log } from '@heynixie/log';
import { readRecordAttachments, readRecords } from '@heynixie/log';
import { ownerMessageCodec } from '@heynixie/tasks';

export interface OwnerImageQuery {
  readonly thread: string;
  readonly sequence: number;
  readonly position: number;
}

export interface OwnerImage {
  readonly mediaType: string;
  readonly bytes: Uint8Array<ArrayBuffer>;
}

export async function readOwnerImage(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  query: OwnerImageQuery,
): Promise<OwnerImage | null> {
  const mediaType = await readStoredMediaType(log, query);

  if (mediaType === null) {
    return null;
  }

  const attachments = await readRecordAttachments(log, [query.sequence]);

  const read = attachments.get(query.sequence);
  const bytes = read?.status === 'readable' ? read.attachments[query.position] : undefined;

  return bytes === undefined ? null : { mediaType, bytes };
}

async function readStoredMediaType(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  query: OwnerImageQuery,
): Promise<string | null> {
  const [entry] = await readRecords(log, {
    afterSequence: query.sequence - 1,
    limit: 1,
    thread: query.thread,
    kinds: ['owner_message'],
  });

  const record = entry?.record;

  if (record?.sequence !== query.sequence) {
    return null;
  }

  const images = ownerMessageCodec.tryDecodePartial(record.payload)?.images;

  return images?.[query.position]?.mediaType ?? null;
}
