import { countTextTokens } from '@heynixie/compaction';
import type { SessionIndex } from '@heynixie/sessions';
import type { StoreParts } from '../types';
import { collectTopicRows } from './collect-topic-rows';
import type { MemoryIndexConfig } from './default-index-settings';
import { defaultIndexSettings } from './default-index-settings';
import { readIndexRows } from './read-index-rows';
import { renderIndexBlock } from './render-index-block';

export function getIndexSettings(parts: Pick<StoreParts, 'context'>): MemoryIndexConfig {
  return parts.context.index ?? defaultIndexSettings;
}

export function readIndex(parts: StoreParts): Promise<SessionIndex> {
  return parts.lock(async () => {
    const settings = getIndexSettings(parts);

    const rows = await readIndexRows(parts);

    if (settings.tokens === 0 || rows.length === 0) {
      return { text: '', items: rows.length, tokens: 0, budget: settings.tokens };
    }

    const text = renderIndexBlock(collectTopicRows(rows), {
      budget: settings.tokens,
      openTopicItems: settings.openTopicItems,
      ownerName: parts.context.gate.ownerName,
    });

    return { text, items: rows.length, tokens: countTextTokens(text), budget: settings.tokens };
  });
}
