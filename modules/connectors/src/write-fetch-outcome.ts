import type { ToolOutcome } from '@heynixie/tools';
import type { FetchReply } from '@heynixie/wire';
import { fitFetchedImage } from './fit-fetched-image';
import type { PageFetch } from './page-fetch';
import type { PageView } from './parse-web-fetch-request';
import { pickPageView } from './pick-page-view';
import type { PassOutcome } from './read-fetch-pass';
import { writeWebFetchPage } from './write-web-fetch-page';

export function writeFetchOutcome(
  fetching: PageFetch,
  outcome: PassOutcome,
  view: PageView,
): Promise<ToolOutcome> {
  if (outcome.kind === 'ended') {
    return Promise.resolve({ status: 'error', message: outcome.reason });
  }

  return outcome.reply.kind === 'image'
    ? runImageResult(fetching, outcome.reply)
    : runPageResult(fetching, outcome.reply, view);
}

type ImageReply = Extract<FetchReply, { readonly kind: 'image' }>;

async function runImageResult(fetching: PageFetch, reply: ImageReply): Promise<ToolOutcome> {
  const fitted = await fitFetchedImage(Buffer.from(reply.base64, 'base64'), fetching.imageLongEdge);

  if (fitted.kind === 'unreadable') {
    return {
      status: 'error',
      message: `${reply.url} sent ${reply.contentType ?? 'a body'} that is no image the model can see: ${fitted.reason}`,
    };
  }

  if (fetching.reserveImages === null) {
    return {
      status: 'error',
      message: `${reply.url} is an image, and this call cannot show the model an image`,
    };
  }

  if (!fetching.reserveImages([fitted.image])) {
    return {
      status: 'error',
      message: `${reply.url} is an image, and this session holds as many images as it can take`,
    };
  }

  return {
    status: 'ok',
    result: {
      url: reply.url,
      status: reply.status,
      contentType: reply.contentType,
      page: null,
      part: null,
      parts: 0,
      text: null,
      isTruncated: false,
      blocked: null,
      image: { mediaType: fitted.image.mediaType, width: fitted.width, height: fitted.height },
    },
    images: [fitted.image],
  };
}

type PageReply = Extract<FetchReply, { readonly kind: 'page' }>;

async function runPageResult(
  fetching: PageFetch,
  reply: PageReply,
  view: PageView,
): Promise<ToolOutcome> {
  if (reply.text === null) {
    return {
      status: 'ok',
      result: {
        url: reply.url,
        status: reply.status,
        contentType: reply.contentType,
        page: null,
        part: null,
        parts: 0,
        text: null,
        isTruncated: reply.isTruncated,
        blocked: reply.blocked,
      },
    };
  }

  const stored = await writeWebFetchPage(
    fetching.log,
    { ...reply, text: reply.text },
    fetching.session,
    fetching.limits,
  );

  return stored === null
    ? {
        status: 'error',
        message: 'the session ended while the page was fetched, so fetch it again by its url',
      }
    : pickPageView(stored, view);
}
