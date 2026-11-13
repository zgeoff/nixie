import { http } from 'msw';
import type {
  KagiError,
  KagiSearchRequest,
  KagiSearchResponse,
  KagiSearchResult,
} from '../kagi-search-request-schema';
import { kagiSearchRequestSchema } from '../kagi-search-request-schema';
import { kagiAPIURL } from './kagi-api-url';
import { kagiStore } from './kagi-store';

export const kagiHandlers = [
  http.post(`${kagiAPIURL}/search`, async (info) => {
    const request = info.request;

    const key = /^Bearer (?<key>\S+)$/u.exec(request.headers.get('authorization') ?? '')?.groups?.[
      'key'
    ];

    if (
      key === undefined ||
      kagiStore.keys.findFirst((query) => query.where({ key })) === undefined
    ) {
      return answerError(401, { code: '2', message: 'Unauthorized' });
    }

    // The root preload runs the web client's MSW server beside this one, and the request reaches
    // both, so a read of the body itself fails with ERR_BODY_ALREADY_USED.
    const body: unknown = await request.clone().json();

    const parsed = kagiSearchRequestSchema.safeParse(body);

    if (!parsed.success) {
      return answerError(400, { code: 'search.invalid_request', message: parsed.error.message });
    }

    const indexed = kagiStore.results.findMany((query) =>
      query.where({ query: parsed.data.query }),
    );

    const search = collectMockHits(indexed, parsed.data, Date.now());

    return Response.json({ data: { search } } satisfies KagiSearchResponse);
  }),
];

function answerError(status: number, detail: KagiError['error'][number]): Response {
  return Response.json({ error: [detail] } satisfies KagiError, { status });
}

const freshnessDays = { day: 1, week: 7, month: 31 } as const;

type IndexedResult = ReturnType<typeof kagiStore.results.findMany>[number];

function collectMockHits(
  indexed: readonly IndexedResult[],
  request: KagiSearchRequest,
  nowMs: number,
): KagiSearchResult[] {
  const sites = request.lens?.sites_included ?? [];
  const freshness = request.lens?.time_relative;

  return indexed
    .filter((result) => sites.length === 0 || sites.includes(new URL(result.url).hostname))
    .filter(
      (result) =>
        freshness === undefined ||
        (result.time !== null &&
          nowMs - Date.parse(result.time) <= freshnessDays[freshness] * 86_400_000),
    )
    .slice(0, request.limit)
    .map((result) => toKagiResult(result));
}

function toKagiResult(result: IndexedResult): KagiSearchResult {
  const snippet = result.snippet === null ? {} : { snippet: result.snippet };
  const time = result.time === null ? {} : { time: result.time };

  return { url: result.url, title: result.title, ...snippet, ...time };
}
