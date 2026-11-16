import type { IndexEntry, MemoryIndex } from '../memory/start-memory-index';
import { startMemoryIndex } from '../memory/start-memory-index';
import type { SearchMode, SemanticSearch } from '../types';
import { buildVectorQuery } from '../utils/build-vector-query';
import { defaultMinSimilarity } from '../utils/default-min-similarity';
import type { MatchScores, RankedMatch } from '../view/merge-rankings';
import { mergeRankings } from '../view/merge-rankings';
import type { VectorIndex } from '../view/start-vector-index';
import { startVectorIndex } from '../view/start-vector-index';

interface TriggerMatch extends MatchScores {
  readonly itemID: string;
}

interface TriggerMatches {
  readonly matches: readonly TriggerMatch[];

  // how the search ran, which holds when it found nothing
  readonly searchMode: SearchMode;
}

interface TriggerMatchOptions {
  readonly limit: number;
  readonly minScore: number;
  readonly excludedIDs: readonly string[];
  readonly excludedWords: readonly string[];

  readonly minSimilarity?: number;
}

// An in-memory search over trigger phrases, rebuilt at each start.
export interface TriggerIndex {
  // one match per item, scored by its best trigger phrase
  readonly readMatches: (text: string, options: TriggerMatchOptions) => Promise<TriggerMatches>;

  readonly set: (itemID: string, phrases: readonly string[]) => Promise<void>;
  readonly remove: (itemID: string) => Promise<void>;

  readonly updateAll: (phrases: ReadonlyMap<string, readonly string[]>) => Promise<void>;

  // true when no encoder runs, so the vector search has nothing to rebuild
  readonly rebuildVectors: (phrases: ReadonlyMap<string, readonly string[]>) => Promise<boolean>;

  readonly waitForIdle: () => Promise<void>;
  readonly stop: () => Promise<void>;
}

interface TriggerState {
  readonly index: MemoryIndex;
  readonly vectors: VectorIndex | null;

  // each item's phrase keys, and the item that owns each key
  readonly keysByItem: Map<string, readonly string[]>;
  readonly itemByKey: Map<string, string>;
}

// The index lives only in process memory, so a forgotten item's phrases never outlive the process.
export async function startTriggerIndex(
  semantic: SemanticSearch | undefined,
): Promise<TriggerIndex> {
  const state: TriggerState = {
    index: await startMemoryIndex(),
    vectors: semantic === undefined ? null : startVectorIndex(semantic.encoder, semantic.onError),
    keysByItem: new Map(),
    itemByKey: new Map(),
  };

  return {
    readMatches: (text, options) => readTriggerMatches(state, text, options),
    set: (itemID, phrases) => writeItemPhrases(state, itemID, phrases),
    remove: (itemID) => removeItemPhrases(state, itemID),
    updateAll: (phrases) => writeAllPhrases(state, phrases),
    rebuildVectors: (phrases) =>
      state.vectors === null ? Promise.resolve(true) : state.vectors.rebuild(buildEntries(phrases)),
    waitForIdle: async () => {
      await state.vectors?.waitForIdle();
    },
    stop: async () => {
      await Promise.all([state.index.stop(), state.vectors?.stop()]);
    },
  };
}

async function readTriggerMatches(
  state: TriggerState,
  text: string,
  options: TriggerMatchOptions,
): Promise<TriggerMatches> {
  const excludedKeys = options.excludedIDs.flatMap((itemID) => state.keysByItem.get(itemID) ?? []);

  // Every phrase must fit under the limit, so that one item's phrases never fill it.
  const phraseLimit = Math.max(1, state.itemByKey.size);

  const [keywordMatches, vectorMatches] = await Promise.all([
    state.index.readMatches(text, {
      limit: phraseLimit,
      minScore: options.minScore,
      excludedIDs: excludedKeys,
      excludedWords: options.excludedWords,
    }),
    state.vectors?.readMatches(buildVectorQuery(text, options.excludedWords), {
      limit: phraseLimit,
      minSimilarity: options.minSimilarity ?? defaultMinSimilarity,
      excludedIDs: excludedKeys,
    }) ?? null,
  ]);

  // Each list arrives best first, so the first phrase of an item is its best.
  const keywordItems = pickBestPerItem(state, keywordMatches);
  const vectorItems = pickBestPerItem(state, vectorMatches ?? []);
  const searchMode = pickSearchMode(state, vectorMatches);

  return {
    matches: mergeRankings(keywordItems, vectorItems)
      .slice(0, options.limit)
      .map((match) => toTriggerMatch(match)),
    searchMode,
  };
}

function pickBestPerItem<Match extends { readonly itemID: string }>(
  state: TriggerState,
  matches: readonly Match[],
): readonly Match[] {
  const best = new Map<string, Match>();

  for (const match of matches) {
    const itemID = state.itemByKey.get(match.itemID);

    if (itemID !== undefined && !best.has(itemID)) {
      best.set(itemID, { ...match, itemID });
    }
  }

  return [...best.values()];
}

function pickSearchMode(state: TriggerState, vectorMatches: readonly unknown[] | null): SearchMode {
  if (state.vectors === null) {
    return 'keyword';
  }

  return vectorMatches === null ? 'keyword-fallback' : 'hybrid';
}

function toTriggerMatch(match: RankedMatch): TriggerMatch {
  return {
    itemID: match.itemID,
    ...(match.score === undefined ? {} : { score: match.score }),
    ...(match.similarity === undefined ? {} : { similarity: match.similarity }),
  };
}

async function writeItemPhrases(
  state: TriggerState,
  itemID: string,
  phrases: readonly string[],
): Promise<void> {
  await removeItemPhrases(state, itemID);

  for (const [position, text] of collectPhrases(phrases).entries()) {
    const entry = { itemID: buildPhraseKey(itemID, position), text };

    await state.index.update(entry);

    state.vectors?.update(entry);
    recordKey(state, entry.itemID);
  }
}

async function removeItemPhrases(state: TriggerState, itemID: string): Promise<void> {
  for (const key of state.keysByItem.get(itemID) ?? []) {
    await state.index.remove(key);

    state.vectors?.remove(key);
    state.itemByKey.delete(key);
  }

  state.keysByItem.delete(itemID);
}

function collectPhrases(phrases: readonly string[]): readonly string[] {
  return phrases.filter((phrase) => phrase.trim() !== '');
}

function buildPhraseKey(itemID: string, position: number): string {
  return `${itemID}#${position}`;
}

function recordKey(state: TriggerState, key: string): void {
  const itemID = key.slice(0, key.lastIndexOf('#'));

  state.itemByKey.set(key, itemID);
  state.keysByItem.set(itemID, [...(state.keysByItem.get(itemID) ?? []), key]);
}

async function writeAllPhrases(
  state: TriggerState,
  phrases: ReadonlyMap<string, readonly string[]>,
): Promise<void> {
  const entries = buildEntries(phrases);

  await state.index.updateAll(entries);

  state.keysByItem.clear();
  state.itemByKey.clear();

  for (const entry of entries) {
    recordKey(state, entry.itemID);
  }
}

function buildEntries(phrases: ReadonlyMap<string, readonly string[]>): readonly IndexEntry[] {
  return [...phrases].flatMap(([itemID, itemPhrases]) =>
    collectPhrases(itemPhrases).map((text, position) => ({
      itemID: buildPhraseKey(itemID, position),
      text,
    })),
  );
}
