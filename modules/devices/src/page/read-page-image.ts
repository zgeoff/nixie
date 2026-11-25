import { readImageEntry } from '@heynixie/connectors';
import type { DeviceImage } from '../screen/read-device-image';
import { readPageContent } from './read-page-content';
import type { PageRequestSource } from './types';

// The image that an image ticket opens, or null for a ticket that nobody issued, a page that the
// region no longer shows, an image that a forget removed, or an image that the page did not declare.
// The image store is read at the time of the request, so a forgotten image stops serving.
export async function readPageImage(
  source: PageRequestSource,
  ticket: string,
): Promise<DeviceImage | null> {
  const opened = source.streams.tickets.read(ticket);

  if (opened?.kind !== 'image') {
    return null;
  }

  const shown = await readPageContent(source, opened);

  if (shown?.content.kind !== 'html' || !(shown.content.images ?? []).includes(opened.image)) {
    return null;
  }

  const entry = await readImageEntry(source.log, opened.image);

  return entry.kind === 'ok' ? { mediaType: entry.row.media_type, bytes: entry.bytes } : null;
}
