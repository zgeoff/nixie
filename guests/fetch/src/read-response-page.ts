import type { IncomingMessage } from 'node:http';
import type { FetchLimits, FetchReply } from '@heynixie/wire';
import { stripLinkMarks } from '@heynixie/wire';
import { buildReadableText } from './build-readable-text';
import { decodeContent } from './decode-content';
import { findBotChallenge } from './find-bot-challenge';
import { readLimitedBody } from './read-limited-body';

// Reads a final response into the result: an HTML page returns its readable text, another text
// type returns as it arrived, and a binary type returns no body. The text stops at the text limit,
// and either limit marks the result truncated. A bot challenge in place of the page sets blocked.
export async function readResponsePage(
  url: URL,
  response: IncomingMessage,
  limits: FetchLimits,
): Promise<FetchReply> {
  const contentType = response.headers['content-type'] ?? null;
  const status = response.statusCode ?? 0;

  try {
    return {
      kind: 'page',
      url: url.href,
      status,
      contentType,
      ...(await readContent(url, response, pickBodyKind(contentType), limits)),
    };
  } finally {
    response.destroy();
  }
}

async function readContent(
  url: URL,
  response: IncomingMessage,
  kind: 'html' | 'text' | 'binary',
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

  const text = buildTextWithinLimit(readable.text, limits.textBytes);

  return {
    text: text.text,
    links: readable.links,
    isTruncated: body.isTruncated || text.isCut,
    blocked: findBotChallenge(status, response.headers, body.text),
  };
}

// the body decoded from its content coding and its charset, cut at the body limit
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

// a decoder for the charset the Content-Type names when TextDecoder knows it, and UTF-8 otherwise
function makeTextDecoder(contentType: string | null): TextDecoder {
  const charset =
    /charset="?(?<label>[\w-]+)"?/iu.exec(contentType ?? '')?.groups?.['label'] ?? 'utf8';

  // TextDecoder takes any WHATWG label at runtime, which its type narrows to a fixed list
  try {
    const decoder: unknown = Reflect.construct(TextDecoder, [charset]);

    return decoder instanceof TextDecoder ? decoder : new TextDecoder();
  } catch {
    return new TextDecoder();
  }
}

// the text cut to at most limit bytes of UTF-8, never inside a character
function buildTextWithinLimit(
  text: string,
  limit: number,
): { readonly text: string; readonly isCut: boolean } {
  const written = new TextEncoder().encodeInto(text, new Uint8Array(limit));

  return written.read === text.length
    ? { text, isCut: false }
    : { text: text.slice(0, written.read), isCut: true };
}

const htmlTypes: ReadonlySet<string> = new Set(['text/html', 'application/xhtml+xml']);

const textTypes: ReadonlySet<string> = new Set([
  'application/json',
  'application/xml',
  'application/javascript',
  'application/ecmascript',
]);

function pickBodyKind(contentType: string | null): 'html' | 'text' | 'binary' {
  const mediaType = (contentType ?? '').split(';')[0]?.trim().toLowerCase() ?? '';

  if (htmlTypes.has(mediaType)) {
    return 'html';
  }

  const isText =
    mediaType.startsWith('text/') ||
    textTypes.has(mediaType) ||
    mediaType.endsWith('+json') ||
    mediaType.endsWith('+xml');

  return isText ? 'text' : 'binary';
}
