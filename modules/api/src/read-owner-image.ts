import { readRecordAttachments, readRecords } from '@heynixie/log';
import { ownerMessageCodec } from '@heynixie/tasks';
import type { APIContext } from './types';

interface OwnerImageInput {
  readonly thread: string;
  readonly sequence: number;
  readonly position: number;
}

// Reads one image of your message on the thread as a file of the type the server found in its
// bytes. Answers null when the record is not your message on that thread, holds no image at that
// position, or was forgotten, so a forgotten image reads as one that never existed.
export async function readOwnerImage(
  context: APIContext,
  input: OwnerImageInput,
): Promise<File | null> {
  const mediaType = await findStoredMediaType(context, input);

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

// the type of the image at the position, when the record is your message on the thread
async function findStoredMediaType(
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

  // the payload names each image's type, which writeOwnerMessage took from the image's bytes
  const images = ownerMessageCodec.tryDecodePartial(record.payload)?.images;

  return images?.[input.position]?.mediaType ?? null;
}
