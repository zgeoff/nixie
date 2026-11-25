import { devicePagePaths } from '@heynixie/contract';
import type { PageFrame } from './build-page-frame';
import { buildPageFrame } from './build-page-frame';
import { readPageContent } from './read-page-content';
import type { PageRequestSource } from './types';

// The page a frame ticket opens, with its policy, or null for a ticket that nobody issued or whose
// region shows other content by now. The layout is read at the time of the request, so a page
// whose minutes passed stops serving with no write.
export async function readPageFrame(
  source: PageRequestSource,
  ticket: string,
  origin: string,
): Promise<PageFrame | null> {
  const opened = source.streams.tickets.read(ticket);

  if (opened?.kind !== 'frame') {
    return null;
  }

  const shown = await readPageContent(source, opened);

  if (shown?.content.kind !== 'html') {
    return null;
  }

  const declared = shown.content.images ?? [];

  const issued = source.streams.tickets.issue(
    opened.deviceID,
    opened.region,
    opened.shown,
    declared,
  );

  return buildPageFrame({
    html: shown.content.html,
    images: new Map(
      issued.images.map((image) => [
        image.image,
        `${origin}${devicePagePaths.images}${image.ticket}`,
      ]),
    ),
    imageBase: `${origin}${devicePagePaths.images}`,
    initialMessages: [],
    isPolicyInline: false,
  });
}
