import type { IncomingMessage } from 'node:http';
import type { FetchLimits, FetchReply } from '@heynixie/wire';
import { decodeContent } from './decode-content';
import { findRetryAfterMs } from './find-retry-after-ms';
import { readLimitedBody } from './read-limited-body';

// The response as text, cut at the body limit, with no reading of HTML and no link marks. A body
// that is not valid UTF-8 reads with replacement characters.
export async function readResponseBody(
  url: URL,
  response: IncomingMessage,
  limits: FetchLimits,
): Promise<FetchReply> {
  const status = response.statusCode ?? 0;

  try {
    const body = await readLimitedBody(
      decodeContent(response, response.headers['content-encoding']),
      limits.bodyBytes,
    );

    return {
      kind: 'body',
      url: url.href,
      status,
      contentType: response.headers['content-type'] ?? null,
      text: new TextDecoder().decode(body.bytes),
      isTruncated: body.isTruncated,
      retryAfterMs: findRetryAfterMs(status, response.headers, Date.now()),
      isGated: false,
    };
  } finally {
    response.destroy();
  }
}
