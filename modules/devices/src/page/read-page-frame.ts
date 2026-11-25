import { devicePagePaths } from '@heynixie/contract';
import type { Log } from '@heynixie/log';
import { readLayout } from '../layout/read-layout';
import type { DeviceStreams } from '../stream/create-device-streams';
import type { ShownRegion } from '../types';
import type { PageFrame } from './build-page-frame';
import { buildPageFrame } from './build-page-frame';

export interface PageRequestSource {
  readonly log: Pick<Log, 'deploymentKey' | 'writer'>;
  readonly nowMs: number;
  readonly streams: Pick<DeviceStreams, 'tickets'>;
}

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

interface OpenedPage {
  readonly deviceID: string;
  readonly region: string;
  readonly shown: string;
}

// What a region shows now, when it shows the content that the ticket was issued for.
export async function readPageContent(
  source: PageRequestSource,
  opened: OpenedPage,
): Promise<ShownRegion | null> {
  const layout = await readLayout(source.log, opened.deviceID, source.nowMs);

  const region = layout?.regions.find((candidate) => candidate.name === opened.region);

  return region?.shown?.shownID === opened.shown ? region.shown : null;
}
