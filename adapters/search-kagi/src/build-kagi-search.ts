import type { SearchProvider, SearchReply, SearchRequest } from '@heynixie/connectors';
import { parseJSONOrNull } from '@heynixie/wire';
import type { KagiSearchRequest } from './kagi-search-request-schema';
import { kagiErrorSchema, kagiSearchResponseSchema } from './kagi-search-request-schema';
import { toPlainText } from './to-plain-text';

export interface KagiSearchOptions {
  readonly apiKey: string;

  // the API's base URL, such as https://kagi.com/api/v1
  readonly apiURL: string;
}

export function buildKagiSearch(options: KagiSearchOptions): SearchProvider {
  return {
    readHits: async (request) => {
      const reply = await readKagiReply(options, request);

      return reply.kind === 'failed'
        ? { kind: 'failed', reason: reply.reason.replaceAll(options.apiKey, '<the API key>') }
        : reply;
    },
  };
}

// Kagi spends up to 4 s collecting results, and the rest covers the round trip.
const requestTimeoutMs = 15_000;

async function readKagiReply(
  options: KagiSearchOptions,
  request: SearchRequest,
): Promise<SearchReply> {
  const response = await fetch(`${options.apiURL}/search`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${options.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(buildKagiRequest(request)),
    signal: AbortSignal.timeout(requestTimeoutMs),
  }).catch((error: unknown) => error);

  if (!(response instanceof Response)) {
    return { kind: 'failed', reason: `Kagi could not be reached: ${String(response)}` };
  }

  const text = await response.text();

  return parseKagiResponse(response.status, text);
}

function buildKagiRequest(request: SearchRequest): KagiSearchRequest {
  const lens = {
    ...(request.sites.length === 0 ? {} : { sites_included: [...request.sites] }),
    ...(request.freshness === null ? {} : { time_relative: request.freshness }),
  };

  return {
    query: request.query,
    workflow: 'search',
    limit: request.limit,
    ...(Object.keys(lens).length === 0 ? {} : { lens }),
  };
}

// Kagi's price list charges $12 for 1000 searches (https://kagi.com/api/pricing).
const kagiSearchCostUSD = 0.012;

function parseKagiResponse(status: number, text: string): SearchReply {
  const body = parseJSONOrNull(text);

  if (status !== 200) {
    const error = kagiErrorSchema.safeParse(body);

    const messages = error.success
      ? error.data.error.map((detail) => detail.message ?? detail.code).join('; ')
      : 'no error detail';

    return { kind: 'failed', reason: `Kagi answered ${String(status)}: ${messages}` };
  }

  const parsed = kagiSearchResponseSchema.safeParse(body);

  return parsed.success
    ? {
        kind: 'hits',
        hits: parsed.data.data.search.map((result) => ({
          title: toPlainText(result.title),
          url: result.url,
          snippet: result.snippet === undefined ? null : toPlainText(result.snippet),

          // Kagi's docs call time "The date when the resource was created or last updated", and
          // Kagi can set its time of day to the moment of the search, so nixie keeps the day alone.
          date: result.time?.slice(0, 10) ?? null,
        })),
        costUSD: kagiSearchCostUSD,
      }
    : { kind: 'failed', reason: 'Kagi answered with results nixie cannot read' };
}
