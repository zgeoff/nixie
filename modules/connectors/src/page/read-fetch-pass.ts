import type { FetchReply } from '@heynixie/wire';
import { buildCacheURL } from '../web/build-cache-url';
import { readCachedWebFetchPage } from '../web/read-cached-web-fetch-page';
import type { StoredPage } from '../web/write-web-fetch-page';
import { makeHopScan } from './make-hop-scan';
import type { PageFetch } from './page-fetch';
import { readHostPause } from './read-host-pause';
import { refuseFetchURL } from './refuse-fetch-url';
import type { SecretScan } from './secret-scan';
import { setReplyPause } from './set-reply-pause';

export type PassOutcome =
  | {
      readonly kind: 'reply';
      readonly reply: Extract<FetchReply, { kind: 'page' | 'image' }>;

      // the URL this pass sent to the fetcher
      readonly sentURL: string;
    }
  | { readonly kind: 'cached'; readonly page: StoredPage }
  | { readonly kind: 'ended'; readonly reason: string }
  | { readonly kind: 'paused'; readonly host: string; readonly leftMs: number };

export async function readFetchPass(
  fetching: PageFetch,
  url: string,
  scan: SecretScan,

  // whether the pass answers from a page the session stored lately; only the first pass does
  readsCache: boolean,
): Promise<PassOutcome> {
  const refusal = await refuseFetchURL(url, scan);

  if (refusal !== null) {
    return { kind: 'ended', reason: refusal };
  }

  if (readsCache) {
    const cached = await readCachedPage(fetching, url);

    if (cached !== null) {
      return { kind: 'cached', page: cached };
    }
  }

  const paused = await readHostPause(fetching, url);

  if (paused !== null) {
    return paused;
  }

  const reply = await fetching.readPage(url, { scanHop: makeHopScan(scan) });

  if (reply.kind === 'refused' || reply.kind === 'failed') {
    return { kind: 'ended', reason: reply.reason };
  }

  setReplyPause(fetching, url, reply);

  return { kind: 'reply', reply, sentURL: url };
}

function readCachedPage(fetching: PageFetch, url: string): Promise<StoredPage | null> {
  const cacheURL = buildCacheURL(url);

  if (cacheURL === null || fetching.cacheMs <= 0) {
    return Promise.resolve(null);
  }

  return readCachedWebFetchPage(fetching.log, {
    sessionKey: fetching.session.sessionKey,
    url: cacheURL,
    storedAfter: fetching.log.writer.clock.now() - fetching.cacheMs,
  });
}
