import type { FetchReply } from '@heynixie/wire';
import { makeHopScan } from './make-hop-scan';
import type { PageFetch } from './page-fetch';
import { readHostPause } from './read-host-pause';
import { refuseFetchURL } from './refuse-fetch-url';
import type { SecretScan } from './secret-scan';
import { setReplyPause } from './set-reply-pause';

export type PassOutcome =
  | { readonly kind: 'reply'; readonly reply: Extract<FetchReply, { kind: 'page' | 'image' }> }
  | { readonly kind: 'ended'; readonly reason: string }
  | { readonly kind: 'paused'; readonly host: string; readonly leftMs: number };

export async function readFetchPass(
  fetching: PageFetch,
  url: string,
  scan: SecretScan,
): Promise<PassOutcome> {
  const refusal = await refuseFetchURL(url, scan);

  if (refusal !== null) {
    return { kind: 'ended', reason: refusal };
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

  return { kind: 'reply', reply };
}
