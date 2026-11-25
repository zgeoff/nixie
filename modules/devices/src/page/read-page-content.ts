import { readLayout } from '../layout/read-layout';
import type { ShownRegion } from '../types';
import type { PageRequestSource } from './types';

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
