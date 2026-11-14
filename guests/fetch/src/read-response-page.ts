import type { IncomingMessage } from 'node:http';
import type { FetchLimits, FetchReply } from '@heynixie/wire';
import { stripLinkMarks } from '@heynixie/wire';
import { buildReadableText } from './build-readable-text';
import { buildTextWithinLimit } from './build-text-within-limit';
import { decodeContent } from './decode-content';
import { findBotChallenge } from './find-bot-challenge';
import { findRetryAfterMs } from './find-retry-after-ms';
import { readLimitedBody } from './read-limited-body';

export async function readResponsePage(
  url: URL,
  response: IncomingMessage,
  limits: FetchLimits,
): Promise<FetchReply> {
  const contentType = response.headers['content-type'] ?? null;
  const status = response.statusCode ?? 0;
  const retryAfterMs = findRetryAfterMs(status, response.headers, Date.now());
  const kind = pickBodyKind(contentType);

  try {
    if (kind === 'image') {
      return await readImage(
        { url: url.href, status, contentType, retryAfterMs, isGated: false },
        response,
        limits,
      );
    }

    return {
      kind: 'page',
      url: url.href,
      status,
      contentType,
      retryAfterMs,
      isGated: false,
      ...(await readContent(url, response, kind, limits)),
    };
  } finally {
    response.destroy();
  }
}

const htmlTypes: ReadonlySet<string> = new Set(['text/html', 'application/xhtml+xml']);

const textTypes: ReadonlySet<string> = new Set([
  'application/json',
  'application/xml',
  'application/javascript',
  'application/ecmascript',
]);

type BodyKind = 'html' | 'text' | 'image' | 'binary';

function pickBodyKind(contentType: string | null): BodyKind {
  const mediaType = (contentType ?? '').split(';')[0]?.trim().toLowerCase() ?? '';

  if (htmlTypes.has(mediaType)) {
    return 'html';
  }

  const isText =
    mediaType.startsWith('text/') ||
    textTypes.has(mediaType) ||
    mediaType.endsWith('+json') ||
    mediaType.endsWith('+xml');

  if (isText) {
    return 'text';
  }

  return mediaType.startsWith('image/') ? 'image' : 'binary';
}

interface ResponseHead {
  readonly url: string;
  readonly status: number;
  readonly contentType: string | null;
  readonly retryAfterMs: number | null;
  readonly isGated: boolean;
}

// An image the site's bot protection sent, or one past the image limit, returns as a page with no
// text, so the model reads the blocked reason or the truncated mark.
async function readImage(
  head: ResponseHead,
  response: IncomingMessage,
  limits: FetchLimits,
): Promise<FetchReply> {
  const blocked = findBotChallenge(head.status, response.headers, null);

  if (blocked !== null) {
    return { kind: 'page', ...head, text: null, links: [], isTruncated: false, blocked };
  }

  const body = await readLimitedBody(
    decodeContent(response, response.headers['content-encoding']),
    limits.imageBytes,
  );

  if (body.isTruncated) {
    return { kind: 'page', ...head, text: null, links: [], isTruncated: true, blocked };
  }

  return { kind: 'image', ...head, base64: Buffer.from(body.bytes).toString('base64') };
}

async function readContent(
  url: URL,
  response: IncomingMessage,
  kind: Exclude<BodyKind, 'image'>,
  limits: FetchLimits,
): Promise<{
  readonly text: string | null;
  readonly links: readonly string[];
  readonly isTruncated: boolean;
  readonly blocked: string | null;
}> {
  const status = response.statusCode ?? 0;

  if (kind === 'binary') {
    return {
      text: null,
      links: [],
      isTruncated: false,
      blocked: findBotChallenge(status, response.headers, null),
    };
  }

  const body = await readBodyText(response, limits);

  const readable =
    kind === 'html'
      ? buildReadableText(body.text, url)
      : { text: stripLinkMarks(body.text), links: [] };

  const text = buildTextWithinLimit(readable, limits.textBytes);

  return {
    text: text.text,
    links: text.links,
    isTruncated: body.isTruncated || text.isCut,
    blocked: findBotChallenge(status, response.headers, body.text),
  };
}

async function readBodyText(
  response: IncomingMessage,
  limits: FetchLimits,
): Promise<{ readonly text: string; readonly isTruncated: boolean }> {
  const body = await readLimitedBody(
    decodeContent(response, response.headers['content-encoding']),
    limits.bodyBytes,
  );

  const text = makeTextDecoder(response.headers['content-type'] ?? null).decode(body.bytes);

  return { text, isTruncated: body.isTruncated };
}

function makeTextDecoder(contentType: string | null): TextDecoder {
  const charset =
    /charset="?(?<label>[\w-]+)"?/iu.exec(contentType ?? '')?.groups?.['label'] ?? 'utf8';

  // TextDecoder takes any WHATWG label at runtime, but its type narrows to a fixed list.
  try {
    const decoder: unknown = Reflect.construct(TextDecoder, [charset]);

    return decoder instanceof TextDecoder ? decoder : new TextDecoder();
  } catch {
    return new TextDecoder();
  }
}
