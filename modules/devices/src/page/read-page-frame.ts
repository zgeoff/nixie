import { devicePagePaths, parsePackageSpec } from '@heynixie/contract';
import type { PageFrame } from '@heynixie/wire';
import { buildPageFrame } from '@heynixie/wire';
import { readDevicePackage } from '../package/read-device-packages';
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

  const packageBases = await readPackageBases(source, shown.content.packages ?? [], origin);

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
    packageBases,
    fetches: { declared: (shown.content.fetches ?? []).map((fetch) => fetch.url), replies: null },
  });
}

// The address prefix of each approved package that the page names. A package that nobody approved
// opens nothing, so a page keeps no access to code that left the approved list.
async function readPackageBases(
  source: PageRequestSource,
  specs: readonly string[],
  origin: string,
): Promise<readonly string[]> {
  const bases: string[] = [];

  for (const spec of specs) {
    const parsed = parsePackageSpec(spec);

    const found =
      parsed === null
        ? null
        : await readDevicePackage(source.log.writer.db, parsed.name, parsed.version);

    if (found !== null) {
      bases.push(`${origin}${devicePagePaths.packages}${found.name}@${found.version}/`);
    }
  }

  return bases;
}
