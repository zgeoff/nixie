import type { FetchReply } from '@heynixie/wire';
import type { PageFetch } from './page-fetch';
import { readHostPause } from './read-host-pause';
import { setReplyPause } from './set-reply-pause';

export type PassOutcome =
  | { readonly kind: 'reply'; readonly reply: Extract<FetchReply, { kind: 'page' | 'image' }> }
  | { readonly kind: 'ended'; readonly reason: string }
  | { readonly kind: 'paused'; readonly host: string; readonly leftMs: number };

export async function readFetchPass(fetching: PageFetch, url: string): Promise<PassOutcome> {
  const paused = await readHostPause(fetching, url);

  if (paused !== null) {
    return paused;
  }

  const reply = await fetching.readPage(url);

  if (reply.kind === 'refused' || reply.kind === 'failed') {
    return { kind: 'ended', reason: reply.reason };
  }

  setReplyPause(fetching, url, reply);

  return { kind: 'reply', reply };
}
