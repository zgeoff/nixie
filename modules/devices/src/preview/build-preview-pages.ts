import type { RenderFile } from '@heynixie/wire';
import { buildPageFrame, renderOrigin } from '@heynixie/wire';
import type { PreviewPageInput } from './types';

// the URL of an image that a page declares but the preview holds no file for, which the render
// refuses as it refuses any other file it lacks
const missingImagePath = 'images/missing';

// The file of each page region of the layout, by the region's name. A page frames as the device
// does, except that its policy sits in a meta tag, because a file carries no headers, and that its
// retained message is its first message.
export function buildPreviewPages(input: PreviewPageInput): ReadonlyMap<string, RenderFile> {
  const pages = new Map<string, RenderFile>();

  if (input.surface.kind !== 'layout') {
    return pages;
  }

  for (const region of input.surface.layout.regions) {
    const content = region.shown?.content;

    if (content?.kind !== 'html') {
      continue;
    }

    const retained = input.retained?.get(region.name);

    const packageBases = (content.packages ?? []).flatMap((spec) =>
      input.packages?.has(spec) === true ? [`${renderOrigin}packages/${spec}/`] : [],
    );

    const frame = buildPageFrame({
      html: content.html,
      images: new Map(
        (content.images ?? []).map((image) => [
          image,
          `${renderOrigin}${input.images.get(image)?.path ?? missingImagePath}`,
        ]),
      ),
      imageBase: `${renderOrigin}images/`,
      initialMessages: retained === undefined ? [] : [retained],
      isPolicyInline: true,
      packageBases,
      fetches: {
        declared: (content.fetches ?? []).map((fetch) => fetch.url),
        replies: input.fetchReplies?.get(region.name) ?? {},
      },
    });

    pages.set(region.name, {
      path: `pages/${String(pages.size)}.html`,
      mediaType: 'text/html',
      base64: Buffer.from(frame.document).toString('base64'),
    });
  }

  return pages;
}
