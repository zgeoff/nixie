import type { Log } from '@heynixie/log';
import type { ToolDefinition, ToolImage, ToolOutcome, ToolRun } from '@heynixie/tools';
import type { FetchReply } from '@heynixie/wire';
import { match } from 'ts-pattern';
import { fitFetchedImage } from './fit-fetched-image';
import type { PageView, WebFetchRequest } from './parse-web-fetch-request';
import { parseWebFetchRequest } from './parse-web-fetch-request';
import { pickPageView } from './pick-page-view';
import { readLinkTarget } from './read-link-target';
import { readWebFetchPage } from './read-web-fetch-page';
import type { PageLimits, PageSession } from './write-web-fetch-page';
import { writeWebFetchPage } from './write-web-fetch-page';

// no required key, since a call names a page by url, link or page, and the run checks the mix
const webFetchInput = {
  type: 'object',
  properties: {
    url: { type: 'string', description: 'the http or https URL of a page to fetch' },
    link: {
      type: 'string',
      description:
        'the ID of a link a page fetched earlier in this session showed, such as L12, to fetch ' +
        'the page it goes to',
    },
    page: {
      type: 'string',
      description:
        'the ID of a page this session fetched, such as tz4a98xxat, to read its stored copy ' +
        'with no new fetch; give part or find with it',
    },
    part: { type: 'integer', minimum: 1, description: 'the number of the part to read, from 1' },
    find: {
      type: 'string',
      minLength: 1,
      description: 'text to look for, in any case; the result is the part of its first match',
    },
  },
  additionalProperties: false,
};

const webFetchOutput = {
  type: 'object',
  properties: {
    url: { type: 'string' },
    status: { type: 'integer', 'x-endorsed': true },
    contentType: { type: ['string', 'null'] },
    page: { type: ['string', 'null'] },
    part: { type: ['integer', 'null'], 'x-endorsed': true },
    parts: { type: 'integer', 'x-endorsed': true },
    text: { type: ['string', 'null'] },
    isTruncated: { type: 'boolean', 'x-endorsed': true },
    blocked: { type: ['string', 'null'] },
    image: {
      type: 'object',
      properties: {
        mediaType: { type: 'string' },
        width: { type: 'integer' },
        height: { type: 'integer' },
      },
      required: ['mediaType', 'width', 'height'],
      additionalProperties: false,
    },
    matches: {
      type: 'array',
      items: {
        type: 'object',
        properties: { part: { type: 'integer' }, snippet: { type: 'string' } },
        required: ['part', 'snippet'],
        additionalProperties: false,
      },
    },
  },
  required: [
    'url',
    'status',
    'contentType',
    'page',
    'part',
    'parts',
    'text',
    'isTruncated',
    'blocked',
  ],
  additionalProperties: false,
};

export interface WebFetchToolOptions {
  // the log whose writer holds the link and page stores
  readonly log: Pick<Log, 'writer'>;

  // the most bytes of text one part of a page holds once its links read as their tags
  readonly textBytes: number;

  // the most characters of an off-site link's path that its tag shows
  readonly linkPathChars: number;

  // the most bytes of parts one session's stored pages hold before the oldest goes
  readonly pageStoreBytes: number;

  // the most pixels of an image's longer side; a larger image returns downscaled
  readonly imageLongEdge: number;
}

export function buildWebFetchTool(
  readPage: (url: string) => Promise<FetchReply>,
  options: WebFetchToolOptions,
): ToolDefinition {
  const log = options.log;

  const limits: PageLimits = {
    textBytes: options.textBytes,
    linkPathChars: options.linkPathChars,
    storeBytes: options.pageStoreBytes,
  };

  return {
    name: 'web_fetch',
    description:
      'Fetches one public web page and returns its final URL, status code, content type and ' +
      'text. An http URL is tried over https first, and the final URL shows the scheme that ' +
      'answered. The text is the readable text of an HTML page, the text of another text type, ' +
      'and no text for a binary type. An image comes back as an image you can see, with no ' +
      'text, its media type and its size in pixels, downscaled when it is large; an image past ' +
      "the fetch's image size limit comes back with no image and isTruncated true. Each link " +
      'in the text reads as its ID, such as [L12]. A ' +
      'link to another host shows that host and the start of its path after the ID, such as ' +
      '[L40 · example.org/docs/…], and never its query string. Pass the ID as link to fetch ' +
      'that page. ' +
      'A long page comes in parts: the result shows the page ID, the part and the count of ' +
      'parts, and holds the text of part 1, or of the part you name. Pass the page ID as page ' +
      'with a part to read another part, or with find to read the part where some text first ' +
      'appears, with up to 10 matches and the text around each; neither fetches the page again. ' +
      'Link and page IDs last for this session only. isTruncated is true when the page passed ' +
      "the fetch's size limit, so no part holds its end. blocked is null, or the reason the " +
      "site's bot protection answered in place of the page, which no retry passes.",
    input: webFetchInput,
    output: webFetchOutput,
    declaration: {
      effects: ['fetch'],
      destinations: [],
      amount: null,
      content: [],
      results: {
        url: 'untrusted',
        status: 'untrusted',
        contentType: 'untrusted',
        page: 'untrusted',
        part: 'untrusted',
        parts: 'untrusted',
        text: 'untrusted',
        isTruncated: 'untrusted',
        blocked: 'untrusted',
        image: 'untrusted',
        matches: 'untrusted',
      },
    },
    execution: 'direct',
    run: (call, context) =>
      runWebFetchCall(
        {
          log,
          readPage,
          session: getPageSession(context.run),
          limits,
          imageLongEdge: options.imageLongEdge,
          reserveImages: context.run.session?.reserveImages ?? null,
        },
        parseWebFetchRequest(call.input),
      ),
  };
}

interface PageFetch {
  readonly log: Pick<Log, 'writer'>;
  readonly readPage: (url: string) => Promise<FetchReply>;
  readonly session: PageSession;
  readonly limits: PageLimits;
  readonly imageLongEdge: number;

  // null for a call under the run's own token, which holds no session to show an image in
  readonly reserveImages: ((images: readonly ToolImage[]) => boolean) | null;
}

function runWebFetchCall(fetching: PageFetch, request: WebFetchRequest): Promise<ToolOutcome> {
  return match(request)
    .with({ kind: 'refused' }, (refused) =>
      Promise.resolve<ToolOutcome>({ status: 'error', message: refused.message }),
    )
    .with({ kind: 'page' }, (page) => readStoredView(fetching, page.pageID, page.view))
    .with({ kind: 'url' }, (url) => runPageFetch(fetching, url.url, url.view))
    .with({ kind: 'link' }, (link) => runLinkFetch(fetching, link.number, link.view))
    .exhaustive();
}

async function readStoredView(
  fetching: PageFetch,
  pageID: string,
  view: PageView,
): Promise<ToolOutcome> {
  const page = await readWebFetchPage(fetching.log, {
    sessionKey: fetching.session.sessionKey,
    pageID,
  });

  return page === null
    ? {
        status: 'error',
        message:
          `${pageID} is not a page of this session. A page ID works only in the session that ` +
          'fetched it, so fetch the page again by its url.',
      }
    : pickPageView(page, view);
}

async function runPageFetch(
  fetching: PageFetch,
  url: string,
  view: PageView,
): Promise<ToolOutcome> {
  const reply = await fetching.readPage(url);

  return match(reply)
    .with({ kind: 'refused' }, { kind: 'failed' }, (refused) =>
      Promise.resolve<ToolOutcome>({ status: 'error', message: refused.reason }),
    )
    .with({ kind: 'image' }, (image) => runImageResult(fetching, image))
    .with({ kind: 'page' }, (page) => runPageResult(fetching, page, view))
    .exhaustive();
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
      message: `${reply.url} is an image, and a call outside a conversation session has no session to show it in`,
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

async function runLinkFetch(
  fetching: PageFetch,
  number: number,
  view: PageView,
): Promise<ToolOutcome> {
  const url = await readLinkTarget(fetching.log, {
    sessionKey: fetching.session.sessionKey,
    number,
  });

  return url === null
    ? {
        status: 'error',
        message:
          `L${number} is not a link from this session. An ID works only in the session whose ` +
          'page showed it, so fetch that page again by its url.',
      }
    : runPageFetch(fetching, url, view);
}

// a call under the run's own token runs in no conversation session, so the run keys its links and
// pages, and no forget fences them
function getPageSession(run: ToolRun): PageSession {
  return {
    sessionKey: run.session?.key ?? run.runID,
    thread: run.thread,
    invalidatedThrough: run.session?.invalidatedThrough ?? null,
  };
}
