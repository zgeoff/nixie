import type { ToolOutcome } from '@heynixie/tools';
import { rewriteFetchURL } from '../fetch/rewrite-fetch-url';
import { writeFetchOutcome } from '../fetch/write-fetch-outcome';
import type { PageView } from '../utils/parse-web-fetch-request';
import type { PageFetch } from './page-fetch';
import { readFetchPass } from './read-fetch-pass';
import { shouldRetryNamedURL } from './should-retry-named-url';

export async function runPageFetch(
  fetching: PageFetch,
  namedURL: string,
  view: PageView,
): Promise<ToolOutcome> {
  const rewrittenURL = rewriteFetchURL(namedURL);
  const wasRewritten = rewrittenURL !== null;

  const first = await readFetchPass(fetching, rewrittenURL ?? namedURL);

  const outcome = shouldRetryNamedURL(wasRewritten, first)
    ? await readFetchPass(fetching, namedURL)
    : first;

  return writeFetchOutcome(fetching, outcome, view);
}
