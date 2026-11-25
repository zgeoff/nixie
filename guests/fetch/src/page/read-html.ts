import type { FetchLimits, FetchReply } from '@heynixie/wire';
import { buildReadableText } from '../utils/build-readable-text';
import { buildTextWithinLimit } from './build-text-within-limit';

// Reads the text and the links of an HTML document that the host sent, with no request. Links
// resolve against the address the request names.
export function readHTML(html: string, baseURL: string, limits: FetchLimits): FetchReply {
  const base = URL.parse(baseURL);

  if (base === null) {
    return {
      kind: 'failed',
      reason: 'the base address of the HTML is not an address',
      isGated: false,
    };
  }

  const text = buildTextWithinLimit(buildReadableText(html, base), limits.textBytes);

  return {
    kind: 'page',
    url: base.href,
    status: 200,
    contentType: 'text/html',
    text: text.text,
    links: text.links,
    isTruncated: text.isCut,
    blocked: null,
    retryAfterMs: null,
    isGated: false,
  };
}
