import type { ToolOutcome } from '@heynixie/tools';
import type { PageFetch } from './page-fetch';
import type { PageView } from './parse-web-fetch-request';
import { readFetchPass } from './read-fetch-pass';
import { rewriteFetchURL } from './rewrite-fetch-url';
import { shouldRetryNamedURL } from './should-retry-named-url';
import { writeFetchOutcome } from './write-fetch-outcome';

export async function runPageFetch(
  fetching: PageFetch,
  namedURL: string,
  view: PageView,
): Promise<ToolOutcome> {
  const rewrittenURL = rewriteFetchURL(namedURL);
  const wasRewritten = rewrittenURL !== null;

  const first = await readFetchPass(fetching.readPage, rewrittenURL ?? namedURL);

  const outcome = shouldRetryNamedURL(wasRewritten, first)
    ? await readFetchPass(fetching.readPage, namedURL)
    : first;

  return writeFetchOutcome(fetching, outcome, view);
}
