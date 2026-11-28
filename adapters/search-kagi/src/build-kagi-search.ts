import type {
  ConnectorFailure,
  ProviderFetch,
  SearchProvider,
  SearchReply,
  SearchRequest,
} from '@heynixie/connectors';
import { readRetryAfterMs } from '@heynixie/connectors';
import { CredentialRefusalError } from '@heynixie/egress';
import { parseJSONOrNull } from '@heynixie/wire';
import type { KagiSearchRequest } from './kagi-search-request-schema';
import { kagiErrorSchema, kagiSearchResponseSchema } from './kagi-search-request-schema';
import { toPlainText } from './to-plain-text';

export interface KagiSearchOptions {
  // adds the API key on the host, so the adapter holds none
  readonly fetch: ProviderFetch;

  // the API's base URL, such as https://kagi.com/api/v1
  readonly apiURL: string;
}

export function buildKagiSearch(options: KagiSearchOptions): SearchProvider {
  return {
    readHits: (request, signal) => readKagiReply(options, request, signal),
  };
}

// Kagi spends up to 4 s collecting results, and the rest covers the round trip.
const requestTimeoutMs = 15_000;

async function readKagiReply(
  options: KagiSearchOptions,
  request: SearchRequest,
  signal: AbortSignal | undefined,
): Promise<SearchReply> {
  const response = await options
    .fetch(`${options.apiURL}/search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildKagiRequest(request)),
      signal: AbortSignal.any([AbortSignal.timeout(requestTimeoutMs), ...(signal ? [signal] : [])]),
    })
    .catch((error: unknown) => error);

  if (response instanceof CredentialRefusalError) {
    throw response;
  }

  if (!(response instanceof Response)) {
    return { kind: 'failed', failure: { code: 'no_answer' } };
  }

  const text = await response.text();

  return parseKagiResponse(response, text);
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

function parseKagiResponse(response: Response, text: string): SearchReply {
  const body = parseJSONOrNull(text);
  const status = response.status;

  if (status !== 200) {
    const error = kagiErrorSchema.safeParse(body);

    const messages = error.success
      ? error.data.error.map((detail) => detail.message ?? detail.code).join('; ')
      : 'no error detail';

    return { kind: 'failed', failure: buildKagiFailure(response, messages) };
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
      }
    : {
        kind: 'failed',
        failure: { code: 'failed', detail: 'Kagi answered with results nixie cannot read' },
      };
}

// A 429 is a rate limit, a 5xx can clear, and any other status is a refusal that a retry would not
// change.
function buildKagiFailure(response: Response, detail: string): ConnectorFailure {
  const status = response.status;
  const retryAfterMs = readRetryAfterMs(response.headers);

  if (status === 429) {
    return {
      code: 'rate_limited',
      status,
      ...(retryAfterMs === null ? {} : { retryAfterMs }),
      detail,
    };
  }

  return { code: status >= 500 ? 'failed' : 'refused', status, detail };
}
