import type { SearchProvider, SearchReply } from '../types';

// A provider that finds no hit, at the price of one Kagi search.
export function buildStubSearchProvider(): SearchProvider {
  return {
    readHits: () => Promise.resolve<SearchReply>({ kind: 'hits', hits: [] }),
  };
}
