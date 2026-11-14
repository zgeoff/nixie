import type { FetchReply } from '@heynixie/wire';

export type PassOutcome =
  | { readonly kind: 'reply'; readonly reply: Extract<FetchReply, { kind: 'page' | 'image' }> }
  | { readonly kind: 'ended'; readonly reason: string };

export async function readFetchPass(
  readPage: (url: string) => Promise<FetchReply>,
  url: string,
): Promise<PassOutcome> {
  const reply = await readPage(url);

  return reply.kind === 'refused' || reply.kind === 'failed'
    ? { kind: 'ended', reason: reply.reason }
    : { kind: 'reply', reply };
}
