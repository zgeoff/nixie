import type { Log } from '@heynixie/log';
import { readRecordAttachments, readRecords } from '@heynixie/log';

export const screenClickToolName = 'computer.screen_click';
const pictureIDPattern = /^screen-(?<sequence>\d{1,15})$/u;

export function buildScreenPictureID(callSequence: number): string {
  return `screen-${String(callSequence)}`;
}

export interface ScreenPicture {
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly mediaType: 'image/png' | 'image/jpeg';
}

// The desktop picture that a screen click stored with its call when it asked, or null. Only the
// call record of a screen click answers, so the route reads no other record's attachments, and a
// forgotten call has none.
export async function readScreenPicture(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  pictureID: string,
): Promise<ScreenPicture | null> {
  const sequence = Number(pictureIDPattern.exec(pictureID)?.groups?.['sequence']);

  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    return null;
  }

  const [entry] = await readRecords(log, { afterSequence: sequence - 1, limit: 1 });

  if (
    entry?.record.sequence !== sequence ||
    entry.record.kind !== 'tool_called' ||
    entry.record.payload['tool'] !== screenClickToolName
  ) {
    return null;
  }

  const found = await readRecordAttachments(log, [sequence]);

  const attached = found.get(sequence);
  const bytes = attached?.status === 'readable' ? attached.attachments[0] : undefined;

  return bytes === undefined ? null : { bytes, mediaType: toMediaType(bytes) };
}

// The stored picture is a PNG or a JPEG, as the fit that shrinks it keeps the format.
function toMediaType(bytes: Uint8Array): ScreenPicture['mediaType'] {
  return bytes[0] === 0xff && bytes[1] === 0xd8 ? 'image/jpeg' : 'image/png';
}
