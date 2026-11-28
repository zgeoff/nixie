import { buildKagiSearch } from '@heynixie/search-kagi';
import invariant from 'tiny-invariant';
import type { ConversationSearch } from '../conversation/types';
import type { SearchSettings } from '../server/create-search-settings';

// The web search tool's provider and limits. The part is planned only when the config has a search
// section, which is when the settings exist.
export function startSearchPart(search: SearchSettings | null): Promise<ConversationSearch> {
  invariant(search !== null, 'the search part starts only with a search section');

  return Promise.resolve({
    provider: buildKagiSearch({ fetch: search.fetch, apiURL: search.apiURL }),
    dailyCallCap: search.dailyCallCap,
    priceMicros: search.priceMicros,
  });
}
