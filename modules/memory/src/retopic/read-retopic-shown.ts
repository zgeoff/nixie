import { readRecordAttachments } from '@heynixie/log';
import type { StoreParts } from '../types';
import { parseRetopicCard } from './parse-retopic-card';

// The IDs of the items that the call's approval card showed, or null when the card is gone, such as
// after a forget of an item the card held.
export async function readRetopicShown(
  parts: Pick<StoreParts, 'context'>,
  callSequence: number,
): Promise<readonly string[] | null> {
  const found = await readRecordAttachments(parts.context.log, [callSequence]);

  const attached = found.get(callSequence);
  const bytes = attached?.status === 'readable' ? attached.attachments[0] : undefined;

  return bytes === undefined ? null : parseRetopicCard(bytes);
}
