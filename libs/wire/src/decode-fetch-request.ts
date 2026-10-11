import type { FetchLimits, FetchRequest } from './fetch-request';
import { parseFetchObject } from './parse-fetch-object';

// Decodes the request nixie sends the fetcher, and throws on a malformed one, so the fetcher never
// runs with a limit or a list it did not get.
export function decodeFetchRequest(bytes: Uint8Array): FetchRequest {
  const request = parseFetchObject(bytes, 'request');
  const limits = request['limits'];
  const deniedRanges = request['deniedRanges'];

  if (typeof request['url'] !== 'string') {
    throw new TypeError('a fetch request needs a url string');
  }
  const ranges: unknown[] = Array.isArray(deniedRanges) ? deniedRanges : [];
  const stringRanges = ranges.filter((range): range is string => typeof range === 'string');

  if (!Array.isArray(deniedRanges) || stringRanges.length !== ranges.length) {
    throw new TypeError('a fetch request needs deniedRanges, a list of strings');
  }
  return { url: request['url'], limits: decodeLimits(limits), deniedRanges: stringRanges };
}

const limitNames = ['bodyBytes', 'timeoutMs', 'redirects', 'textBytes'] as const;

function decodeLimits(value: unknown): FetchLimits {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('a fetch request needs limits');
  }
  const limits = new Map(Object.entries(value));

  for (const name of limitNames) {
    const limit = limits.get(name);

    if (typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit < 0) {
      throw new TypeError(`a fetch request needs limits.${name}, a whole number of 0 or more`);
    }
  }
  return {
    bodyBytes: Number(limits.get('bodyBytes')),
    timeoutMs: Number(limits.get('timeoutMs')),
    redirects: Number(limits.get('redirects')),
    textBytes: Number(limits.get('textBytes')),
  };
}
