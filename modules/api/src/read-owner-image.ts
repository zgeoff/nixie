import { readRecordAttachments, readRecords } from '@heynixie/log';
import { ownerMessageCodec } from '@heynixie/tasks';
import type { APIContext } from './types';

interface OwnerImageInput {
  readonly thread: string;
  readonly sequence: number;
  readonly position: number;
}

export async function readOwnerImage(
  context: APIContext,
  input: OwnerImageInput,
): Promise<File | null> {
  const mediaType = await readStoredMediaType(context, input);

  if (mediaType === null) {
    return null;
  }

  const attachments = await readRecordAttachments(context.log, [input.sequence]);

  const read = attachments.get(input.sequence);
  const bytes = read?.status === 'readable' ? read.attachments[input.position] : undefined;

  return bytes === undefined
    ? null
    : new File([bytes], `image-${input.position + 1}`, { type: mediaType });
}

async function readStoredMediaType(
  context: APIContext,
  input: OwnerImageInput,
): Promise<string | null> {
  const [entry] = await readRecords(context.log, {
    afterSequence: input.sequence - 1,
    limit: 1,
    thread: input.thread,
    kinds: ['owner_message'],
  });

  const record = entry?.record;

  if (record?.sequence !== input.sequence) {
    return null;
  }

  const images = ownerMessageCodec.tryDecodePartial(record.payload)?.images;

  return images?.[input.position]?.mediaType ?? null;
}
