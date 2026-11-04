import type { Log } from '@heynixie/log';
import { writeLinkNumbers } from '../write-link-numbers';

export interface WebFetchLinksSeed {
  readonly sessionKey: string;
  readonly thread: string;
  readonly urls: readonly string[];
}

export async function seedWebFetchLinks(
  log: Pick<Log, 'writer'>,
  seed: WebFetchLinksSeed,
): Promise<void> {
  await writeLinkNumbers(log, { ...seed, invalidatedThrough: null });
}
