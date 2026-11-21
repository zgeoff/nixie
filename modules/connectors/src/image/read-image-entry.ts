import type { Log } from '@heynixie/log';
import { readRecordAttachments } from '@heynixie/log';
import type { ImageRow } from './image-tables';
import { readImageRow } from './read-image-row';

export type ImageEntry =
  | { readonly kind: 'missing' }
  | { readonly kind: 'forgotten'; readonly row: ImageRow }
  | { readonly kind: 'ok'; readonly row: ImageRow; readonly bytes: Uint8Array<ArrayBuffer> };

// An image of any thread, with its bytes. An image whose result record a forget made unreadable
// reads as forgotten, and its row stays so the edit chain keeps its shape.
export async function readImageEntry(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  id: string,
): Promise<ImageEntry> {
  const row = await readImageRow(log, id);

  if (row === null) {
    return { kind: 'missing' };
  }

  const attachments = await readRecordAttachments(log, [row.sequence]);

  const stored = attachments.get(row.sequence);
  const bytes = stored?.status === 'readable' ? stored.attachments[row.position] : undefined;

  return bytes === undefined ? { kind: 'forgotten', row } : { kind: 'ok', row, bytes };
}
