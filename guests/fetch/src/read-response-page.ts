// oxlint-disable typescript/prefer-readonly-parameter-types -- a URL and a node stream have no readonly form
import type { IncomingMessage } from 'node:http';
import type { FetchLimits, FetchReply } from '@heynixie/wire';
import { buildReadableText } from './build-readable-text';
import { decodeContent } from './decode-content';
import { readLimitedBody } from './read-limited-body';

// Reads a final response into the result: an HTML page returns its readable text, another text
// type returns as it arrived, and a binary type returns no body. The text stops at the text limit,
// and either limit marks the result truncated.
export async function readResponsePage(
  url: URL,
  response: IncomingMessage,
  limits: FetchLimits,
): Promise<FetchReply> {
  const contentType = response.headers['content-type'] ?? null;
  const kind = pickBodyKind(contentType);
  const page = {
    kind: 'page' as const,
    url: url.href,
    status: response.statusCode ?? 0,
    contentType,
  };

  try {
    return kind === 'binary'
      ? { ...page, text: null, isTruncated: false }
      : { ...page, ...(await readText(response, kind, limits)) };
  } finally {
    response.destroy();
  }
}

async function readText(
  response: IncomingMessage,
  kind: 'html' | 'text',
  limits: FetchLimits,
): Promise<{ readonly text: string; readonly isTruncated: boolean }> {
  const body = await readLimitedBody(
    decodeContent(response, response.headers['content-encoding']),
    limits.bodyBytes,
  );
  const decoded = makeTextDecoder(response.headers['content-type'] ?? null).decode(body.bytes);
  const readable = kind === 'html' ? buildReadableText(decoded) : decoded;
  const text = buildTextWithinLimit(readable, limits.textBytes);

  return { text: text.text, isTruncated: body.isTruncated || text.isCut };
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
