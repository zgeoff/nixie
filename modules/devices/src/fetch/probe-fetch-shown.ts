import { readLayout } from '../layout/read-layout';
import type { FetchTarget, PageFetchesOptions } from './types';

// Whether the region still shows the content that declared the fetch, and still names its URL. A
// page that a later call replaced, a temporary replacement that expired, or a forget that erased the
// page ends its fetches, so none starts after that.
export async function probeFetchShown(
  options: PageFetchesOptions,
  target: FetchTarget,
): Promise<boolean> {
  const layout = await readLayout(options.log, target.deviceID, options.clock.now());

  const content = layout?.regions.find((region) => region.name === target.region)?.shown;

  return (
    content?.shownID === target.shown &&
    content.content.kind === 'html' &&
    content.content.fetches?.some((fetch) => fetch.url === target.url) === true
  );
}
