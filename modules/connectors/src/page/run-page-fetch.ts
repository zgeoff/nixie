import type { ToolOutcome } from '@heynixie/tools';
import { rewriteFetchURL } from '../fetch/rewrite-fetch-url';
import { writeFetchOutcome } from '../fetch/write-fetch-outcome';
import type { PageView } from '../utils/parse-web-fetch-request';
import { makeTypedExemption } from './make-typed-exemption';
import type { PageFetch } from './page-fetch';
import { readFetchPass } from './read-fetch-pass';
import type { SecretScan } from './secret-scan';
import { shouldRetryNamedURL } from './should-retry-named-url';

export async function runPageFetch(
  fetching: PageFetch,
  namedURL: string,
  view: PageView,
): Promise<ToolOutcome> {
  const setup = fetching.secretScan;

  const scan: SecretScan = {
    findSecret: setup.findSecret,
    logger: setup.logger,
    isExempt: makeTypedExemption({
      isOwnerTyped: setup.isOwnerTyped,
      run: setup.run,
      namedURL,
      covers: setup.typedURLCovers,
    }),
  };

  const rewrittenURL = rewriteFetchURL(namedURL);
  const wasRewritten = rewrittenURL !== null;

  const first = await readFetchPass(fetching, rewrittenURL ?? namedURL, scan);

  const outcome = shouldRetryNamedURL(wasRewritten, first)
    ? await readFetchPass(fetching, namedURL, scan)
    : first;

  return writeFetchOutcome(fetching, outcome, view);
}
